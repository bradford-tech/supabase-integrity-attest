---
title: The withAssertion wrapper
nextjs:
  metadata:
    title: The withAssertion wrapper
    description: A high-level middleware that handles assertion extraction, verification, atomic counter updates, and error responses.
---

`withAssertion` wraps your edge function handler with automatic assertion verification, so you don't have to repeat the boilerplate on every endpoint. It also handles the counter compare-and-swap that is easy to get wrong when implementing verification by hand. {% .lead %}

---

## Basic usage

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withAssertion } from '@bradford-tech/supabase-integrity-attest/assertion'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const handler = withAssertion(
  {
    appId: Deno.env.get('APP_ID')!,
    developmentEnv: Deno.env.get('ENVIRONMENT') !== 'production',

    getDeviceKey: async (deviceId) => {
      const { data } = await supabase
        .from('app_attest_devices')
        .select('public_key_pem, sign_count')
        .eq('device_id', deviceId)
        .single()

      if (!data) return null
      return {
        publicKeyPem: data.public_key_pem,
        signCount: data.sign_count,
      }
    },

    // Atomic compare-and-swap. Returns true if the row was advanced,
    // false if another concurrent request already passed this count.
    commitSignCount: async (deviceId, newSignCount) => {
      const { count } = await supabase
        .from('app_attest_devices')
        .update({ sign_count: newSignCount }, { count: 'exact' })
        .eq('device_id', deviceId)
        .lt('sign_count', newSignCount)
      return (count ?? 0) > 0
    },
  },
  async (req, { deviceId, signCount, rawBody, timings }) => {
    // Your handler runs only after successful verification and commit.
    // Read the body via rawBody — never call req.json() again.
    const body = JSON.parse(new TextDecoder().decode(rawBody))
    return new Response(
      JSON.stringify({ ok: true, deviceId, signCount, timings }),
      { status: 200 },
    )
  },
)

Deno.serve(handler)
```

---

## What it does for you

1. **Extracts** the assertion and device ID from request headers (`X-App-Attest-Assertion` and `X-App-Attest-Device-Id` by default).
2. **Looks up** the device's public key and counter via your `getDeviceKey` callback.
3. **Verifies** the assertion against the raw request body.
4. **Atomically commits** the new counter via your `commitSignCount` compare-and-swap callback. If the CAS returns `false`, the wrapper throws `AssertionError(SIGN_COUNT_STALE)` and your handler never runs.
5. **Calls** your handler with the verified context, including library-internal timing spans.

If any step fails, it returns an appropriate error response (400 for bad format, 401 for invalid or stale assertions, 500 for storage errors) without calling your handler.

---

## Why `commitSignCount` must be a compare-and-swap

The naive "read counter, verify assertion, write counter" pattern has a silent race under concurrent load: two parallel requests can both read the same stored value, both pass verification, and the later write can overwrite the earlier one with a lower count. Replay protection is then silently broken for the next request.

The `commitSignCount` contract requires you to atomically update only when the stored value is strictly less than the new value:

```sql
UPDATE app_attest_devices
   SET sign_count = $1,
       last_seen_at = now()
 WHERE device_id = $2
   AND sign_count < $1
```

Return `rowCount > 0`. If the update affected zero rows, another concurrent request already advanced past this counter and your request is correctly rejected with `SIGN_COUNT_STALE`.

Under high concurrency (rapid-fire requests from a single device), expect a non-trivial rate of `SIGN_COUNT_STALE` errors. This is correct behavior — the client should serialize its own requests or accept occasional stale rejections, not the server loosening the check.

---

## Timings

The `timings` field on the handler context exposes library-internal span durations in milliseconds:

```ts
type AssertionTimings = {
  extractMs: number // Parse headers + read body bytes
  getDeviceKeyMs: number // getDeviceKey callback wall-clock
  verifyMs: number // Cryptographic verify
  commitMs: number // commitSignCount callback wall-clock
}
```

Merge these into your own `Server-Timing` header alongside your business-logic spans. The demo's shared `timing.ts` helper shows the pattern.

---

## Custom headers

If your client sends assertion data in different headers, provide an `extractAssertion` callback:

```ts
withAssertion(
  {
    appId: '...',
    getDeviceKey: async (deviceId) => {
      /* ... */
    },
    commitSignCount: async (deviceId, newSignCount) => {
      /* ... */
    },

    extractAssertion: async (req) => {
      const assertion = req.headers.get('X-Custom-Assertion')!
      const deviceId = req.headers.get('X-Custom-Device')!
      const clientData = new Uint8Array(await req.arrayBuffer())
      return { assertion, deviceId, clientData }
    },
  },
  handler,
)
```

---

## Custom error handling

Override the default error responses with `onError`:

```ts
withAssertion(
  {
    appId: '...',
    getDeviceKey: async (deviceId) => {
      /* ... */
    },
    commitSignCount: async (deviceId, newSignCount) => {
      /* ... */
    },

    onError: (error, req) => {
      console.error(`Assertion failed for ${req.url}: ${error.code}`)
      return new Response('Unauthorized', { status: 401 })
    },
  },
  handler,
)
```

---

## When to use withAssertion vs verifyAssertion

| Use `withAssertion` when...                            | Use `verifyAssertion` when...                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Standard header-based assertion flow                   | Non-standard assertion delivery (WebSocket, etc.)                                                             |
| You want default error responses                       | You need custom error logic per-endpoint                                                                      |
| Multiple endpoints share the same verification pattern | You need to verify assertions in a larger middleware chain ([see manual example](/docs/verifying-assertions)) |

For the full API details, see the [withAssertion() reference](/docs/api-with-assertion).
