---
title: Verifying assertions
nextjs:
  metadata:
    title: Verifying assertions
    description: Complete Supabase Edge Function example for verifying Apple App Attest assertions on every request.
---

A complete edge function that verifies an [assertion](/docs/assertion) on every protected request, built directly on `verifyAssertion()` — for when you need more control than the [`withAssertion` wrapper](/docs/with-assertion) provides. {% .lead %}

---

## The edge function

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  verifyAssertion,
  AssertionError,
  AssertionErrorCode,
} from '@bradford-tech/supabase-integrity-attest/assertion'

const appInfo = {
  appId: Deno.env.get('APP_ID')!,
  developmentEnv: Deno.env.get('ENVIRONMENT') !== 'production',
}

Deno.serve(async (req: Request) => {
  const assertion = req.headers.get('X-App-Attest-Assertion')
  const deviceId = req.headers.get('X-App-Attest-Device-Id')

  if (!assertion || !deviceId) {
    return new Response(
      JSON.stringify({ error: 'Missing attestation headers' }),
      { status: 400 },
    )
  }

  // 1. Read the raw request body — this IS the clientData
  const rawBody = new Uint8Array(await req.arrayBuffer())

  // 2. Look up the device's stored key and counter
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: device } = await supabase
    .from('app_attest_devices')
    .select('public_key_pem, sign_count')
    .eq('device_id', deviceId)
    .single()

  if (!device) {
    return new Response(JSON.stringify({ error: 'Unknown device' }), {
      status: 401,
    })
  }

  // 3. Verify the assertion
  try {
    const result = await verifyAssertion(
      appInfo,
      assertion, // Base64-encoded CBOR assertion
      rawBody, // Raw request body bytes
      device.public_key_pem, // PEM from attestation
      device.sign_count, // Previous counter value
    )

    // 4. Atomically commit the new sign count — compare-and-swap so a
    //    concurrent request can't silently corrupt replay protection.
    const { count } = await supabase
      .from('app_attest_devices')
      .update({ sign_count: result.signCount })
      .eq('device_id', deviceId)
      .lt('sign_count', result.signCount)
      .select('*', { count: 'exact', head: true })

    if (!count || count === 0) {
      // Another concurrent request already advanced past this count.
      return new Response(
        JSON.stringify({
          error: 'Sign count is stale',
          code: 'SIGN_COUNT_STALE',
        }),
        { status: 401 },
      )
    }

    // 5. Process the actual request
    const body = JSON.parse(new TextDecoder().decode(rawBody))
    // ... your business logic here ...

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (error) {
    if (error instanceof AssertionError) {
      const status =
        error.code === AssertionErrorCode.INVALID_FORMAT ? 400 : 401
      return new Response(
        JSON.stringify({ error: error.message, code: error.code }),
        { status },
      )
    }
    throw error
  }
})
```

---

## Key details

**The raw body is the clientData.** The client signs the raw request body. Your server must read the body as raw bytes (`req.arrayBuffer()`) and pass those same bytes to [`verifyAssertion()`](/docs/verify-assertion). If you parse the body first and re-serialize it, the bytes may differ and the signature will fail.

**Use compare-and-swap for the counter update.** The naive pattern of "read counter, verify assertion, write counter" has a TOCTOU race under concurrent load: two concurrent requests can both read the same stored value, both pass verification, and the second write can overwrite the first with a lower count — silently corrupting replay protection. Always update with a `WHERE sign_count < new_count` predicate and check that a row was actually affected. The [`withAssertion` wrapper](/docs/with-assertion) handles this for you.

**Use the `./assertion` subpath.** This edge function doesn't need attestation verification, so importing from `@bradford-tech/supabase-integrity-attest/assertion` avoids loading `asn1js` and `@noble/curves`. For a higher-level alternative that eliminates this boilerplate, see the [`withAssertion()` wrapper](/docs/with-assertion).

{% callout type="note" title="Counter persistence" %}
The `signCount` must be persisted atomically after every successful assertion via compare-and-swap. If you lose the updated counter, the next valid assertion will be rejected as a replay. If you update without the CAS predicate, you'll silently corrupt your replay protection under load.
{% /callout %}
