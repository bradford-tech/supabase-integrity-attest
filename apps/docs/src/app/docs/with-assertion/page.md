---
title: The withAssertion wrapper
nextjs:
  metadata:
    title: The withAssertion wrapper
    description: A high-level middleware that handles assertion extraction, verification, counter updates, and error responses.
---

`withAssertion` wraps your edge function handler with automatic assertion verification, so you don't have to repeat the boilerplate on every endpoint. {% .lead %}

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
        .from('devices')
        .select('public_key_pem, sign_count')
        .eq('device_id', deviceId)
        .single()

      if (!data) return null
      return {
        publicKeyPem: data.public_key_pem,
        signCount: data.sign_count,
      }
    },

    updateSignCount: async (deviceId, newSignCount) => {
      await supabase
        .from('devices')
        .update({ sign_count: newSignCount })
        .eq('device_id', deviceId)
    },
  },
  async (req, { deviceId, signCount, rawBody }) => {
    // Your handler runs only after successful verification
    const body = JSON.parse(new TextDecoder().decode(rawBody))
    return new Response(JSON.stringify({ ok: true, deviceId }), {
      status: 200,
    })
  },
)

Deno.serve(handler)
```

---

## What it does for you

1. **Extracts** the assertion and device ID from request headers (`X-App-Attest-Assertion` and `X-App-Attest-Device-Id` by default).
2. **Looks up** the device's public key and counter via your `getDeviceKey` callback.
3. **Verifies** the assertion against the raw request body.
4. **Updates** the counter via your `updateSignCount` callback.
5. **Calls** your handler with the verified context.

If any step fails, it returns an appropriate error response (400 for bad format, 401 for invalid assertion, 500 for storage errors) without calling your handler.

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
    updateSignCount: async (deviceId, newSignCount) => {
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
    updateSignCount: async (deviceId, newSignCount) => {
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
