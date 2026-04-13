---
title: The withAttestation wrapper
nextjs:
  metadata:
    title: The withAttestation wrapper
    description: A high-level middleware that handles challenge consumption, attestation verification, and device key persistence.
---

`withAttestation` is the symmetric pair of [`withAssertion`](/docs/with-assertion) — use it on your one-time device registration endpoint to eliminate attestation boilerplate. {% .lead %}

---

## Basic usage

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { withAttestation } from '@bradford-tech/supabase-integrity-attest/attestation'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// supabase-js serializes Uint8Array via JSON.stringify, which writes
// {"0":byte,"1":byte,...} JSON text — not raw bytes — into bytea
// columns. Convert to Postgres hex literal so inserts and filters
// round-trip correctly.
function toPgBytea(bytes: Uint8Array): string {
  let hex = '\\x'
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

const handler = withAttestation(
  {
    appId: Deno.env.get('APP_ID')!,
    developmentEnv: Deno.env.get('ENVIRONMENT') !== 'production',

    // Atomic single-use consume. Returns true if the challenge was valid,
    // unused, and unexpired (and is now consumed); false otherwise.
    consumeChallenge: async (challenge) => {
      const { data } = await supabase
        .from('app_attest_challenges')
        .delete()
        .eq('challenge', toPgBytea(challenge))
        .eq('purpose', 'attestation')
        .gt('expires_at', new Date().toISOString())
        .select()
        .single()
      return data !== null
    },

    // Upsert — re-attesting is cryptographically safe (Apple re-signs).
    storeDeviceKey: async ({ deviceId, publicKeyPem, signCount, receipt }) => {
      await supabase.from('app_attest_devices').upsert({
        device_id: deviceId,
        public_key_pem: publicKeyPem,
        sign_count: signCount,
        receipt: toPgBytea(receipt),
      })
    },
  },
  (_req, ctx) => {
    // Handler runs only after successful verification and persistence.
    return Response.json({
      ok: true,
      deviceId: ctx.deviceId,
      timings: ctx.timings,
    })
  },
)

Deno.serve(handler)
```

---

## What it does for you

1. **Extracts** the request body as JSON, expecting `{ keyId, challenge, attestation }` with all three values base64-encoded. Override with `extractAttestation` for a different wire format.
2. **Consumes the challenge** via your `consumeChallenge` callback using the raw challenge bytes (for DB lookup). If the callback returns `false`, the wrapper throws `AttestationError(CHALLENGE_INVALID)` and your handler never runs.
3. **Hashes the challenge** — computes `clientDataHash = SHA-256(challenge)` to match what client SDKs (Expo's `attestKeyAsync`, native `DCAppAttestService` wrappers) pass to Apple. This step is why you don't need to think about `clientDataHash` when using this wrapper — it's handled for you.
4. **Verifies the attestation** cryptographically — CBOR decode, X.509 cert chain, nonce (using the hashed challenge), key extract, AAGUID, credentialId check.
5. **Persists** the verified key via your `storeDeviceKey` callback.
6. **Calls** your handler with the verified context, including the extracted `publicKeyPem`, `receipt`, and library-internal timing spans.

Any step that fails short-circuits to an `AttestationError` → JSON error response.

---

## Why `consumeChallenge` must be atomic

The challenge is single-use. A naive "read → check → delete" pattern is racy: two concurrent attestations can both read the same challenge before either deletes it, and both can pass the consume step. Implement `consumeChallenge` as an atomic `DELETE ... RETURNING` that filters on `purpose` and `expires_at > now()`, and return whether the delete affected a row:

```sql
DELETE FROM app_attest_challenges
 WHERE challenge = $1
   AND purpose = 'attestation'
   AND expires_at > now()
RETURNING challenge
```

Return `true` if the query returned a row, `false` otherwise.

---

## Timings

The `timings` field on the handler context exposes library-internal span durations in milliseconds:

```ts
type AttestationTimings = {
  extractMs: number // Parse body + decode base64 fields
  consumeChallengeMs: number // consumeChallenge callback wall-clock
  verifyMs: number // CBOR + cert chain + nonce + key extract
  storeDeviceKeyMs: number // storeDeviceKey callback wall-clock
}
```

Merge these into your own `Server-Timing` header alongside your business-logic spans.

---

## Custom extraction

If your clients send the attestation payload in a different shape (headers, multipart, etc.), provide an `extractAttestation` callback:

```ts
withAttestation(
  {
    appId: '...',
    consumeChallenge: async (challenge) => {
      /* ... */
    },
    storeDeviceKey: async (row) => {
      /* ... */
    },

    extractAttestation: async (req) => {
      const deviceId = req.headers.get('X-Device-Id')!
      const { challenge, attestation } = await req.json()
      return {
        deviceId,
        challenge: decodeBase64(challenge),
        attestation: decodeBase64(attestation),
      }
    },
  },
  handler,
)
```

---

## When to use withAttestation vs verifyAttestation

| Use `withAttestation` when...                          | Use `verifyAttestation` when...                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Standard JSON-body attestation payload                 | Non-standard delivery (WebSocket, binary protocols)                                                                    |
| You want default error responses                       | You need custom error branching per-endpoint                                                                           |
| You're using `app_attest_challenges` for nonce storage | You have a fundamentally different challenge-storage architecture ([see manual example](/docs/verifying-attestations)) |

For the full API details, see the [withAttestation() reference](/docs/api-with-attestation).
