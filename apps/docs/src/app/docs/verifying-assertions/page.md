---
title: Verifying assertions
nextjs:
  metadata:
    title: Verifying assertions
    description: Complete Supabase Edge Function example for verifying Apple App Attest assertions on every request.
---

A complete edge function that verifies an assertion on every protected request. {% .lead %}

---

## The edge function

```ts
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import {
  verifyAssertion,
  AssertionError,
  AssertionErrorCode,
} from '@bradford-tech/supabase-integrity-attest/assertion'

const appInfo = {
  appId: Deno.env.get('APP_ID')!,
  developmentEnv: Deno.env.get('ENVIRONMENT') !== 'production',
}

serve(async (req: Request) => {
  const assertion = req.headers.get('X-App-Attest-Assertion')
  const deviceId = req.headers.get('X-App-Attest-Device-Id')

  if (!assertion || !deviceId) {
    return new Response(
      JSON.stringify({ error: 'Missing attestation headers' }),
      {
        status: 400,
      },
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
    .from('devices')
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

    // 4. Update the sign count BEFORE processing the request
    await supabase
      .from('devices')
      .update({ sign_count: result.signCount })
      .eq('device_id', deviceId)

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

**The raw body is the clientData.** The client signs the raw request body. Your server must read the body as raw bytes (`req.arrayBuffer()`) and pass those same bytes to `verifyAssertion()`. If you parse the body first and re-serialize it, the bytes may differ and the signature will fail.

**Update the counter before responding.** If your server crashes between sending the response and updating the counter, the next request will pass verification with the old counter. Update first, then process.

**Use the `./assertion` subpath.** This edge function doesn't need attestation verification, so importing from `@bradford-tech/supabase-integrity-attest/assertion` avoids loading `asn1js` and `@noble/curves`.

{% callout type="note" title="Counter persistence" %}
The `signCount` must be persisted after every successful assertion. If you lose the updated counter, the next valid assertion will be rejected as a replay.
{% /callout %}
