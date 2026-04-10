---
title: withAttestation() reference
nextjs:
  metadata:
    title: withAttestation() reference
    description: Full API reference for the withAttestation middleware wrapper.
---

A middleware wrapper that handles challenge consumption, attestation verification, and device key persistence. {% .lead %}

---

## Signature

```ts
function withAttestation(
  options: WithAttestationOptions,
  handler: (
    req: Request,
    context: AttestationContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response>
```

---

## Options

| Field                | Type                                                                        | Required | Description                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`              | `string`                                                                    | Yes      | Your Team ID + bundle ID (e.g., `"TEAMID1234.com.example.app"`).                                                                              |
| `developmentEnv`     | `boolean`                                                                   | No       | Default `false`. Set `true` for development AAGUID.                                                                                           |
| `consumeChallenge`   | `(challenge: Uint8Array) => Promise<boolean>`                               | Yes      | **Atomic single-use consume.** Return `true` if the challenge was valid, unused, and unexpired (and is now consumed). Return `false` otherwise. |
| `storeDeviceKey`     | `(row: { deviceId, publicKeyPem, signCount, receipt }) => Promise<void>`    | Yes      | Persist the verified key. Caller chooses INSERT vs UPSERT — upsert is usually correct.                                                        |
| `extractAttestation` | `ExtractAttestationFn`                                                      | No       | Custom extraction logic. Default reads a JSON body of `{ keyId, challenge, attestation }` with base64-encoded values.                         |
| `onError`            | `(error: AttestationError, req: Request) => Response \| Promise<Response>`  | No       | Custom error response handler.                                                                                                                |

---

## Types

### AttestationTimings

Library-internal timing spans in milliseconds.

```ts
type AttestationTimings = {
  extractMs: number            // Parse body + decode base64 fields
  consumeChallengeMs: number   // consumeChallenge callback wall-clock duration
  verifyMs: number             // Cryptographic attestation verification
  storeDeviceKeyMs: number     // storeDeviceKey callback wall-clock duration
}
```

### AttestationContext

Passed to your handler after successful verification and persistence:

```ts
type AttestationContext = {
  deviceId: string               // Apple-issued keyId from the request
  publicKeyPem: string           // PEM-encoded ECDSA P-256 public key
  signCount: number              // Always 0 for a fresh attestation
  receipt: Uint8Array            // Raw Apple receipt bytes
  timings: AttestationTimings    // Library-internal spans
}
```

### ExtractAttestationFn

```ts
type ExtractAttestationFn = (req: Request) => Promise<{
  deviceId: string
  challenge: Uint8Array
  attestation: Uint8Array
}>
```

Custom extraction callback. The default reads a JSON body of the shape `{ keyId: string, challenge: string, attestation: string }` where `challenge` and `attestation` are base64-encoded.

---

## Default error responses

When verification fails and no `onError` is provided:

| Error code                | HTTP status | Response body                                                     |
| ------------------------- | ----------- | ----------------------------------------------------------------- |
| `INVALID_FORMAT`          | 400         | `{ "error": "...", "code": "INVALID_FORMAT" }`                    |
| `CHALLENGE_INVALID`       | 401         | `{ "error": "...", "code": "CHALLENGE_INVALID" }`                 |
| `INVALID_CERTIFICATE_CHAIN` | 401       | `{ "error": "...", "code": "INVALID_CERTIFICATE_CHAIN" }`         |
| `NONCE_MISMATCH`          | 401         | `{ "error": "...", "code": "NONCE_MISMATCH" }`                    |
| `RP_ID_MISMATCH`          | 401         | `{ "error": "...", "code": "RP_ID_MISMATCH" }`                    |
| `KEY_ID_MISMATCH`         | 401         | `{ "error": "...", "code": "KEY_ID_MISMATCH" }`                   |
| `INVALID_COUNTER`         | 401         | `{ "error": "...", "code": "INVALID_COUNTER" }`                   |
| `INVALID_AAGUID`          | 401         | `{ "error": "...", "code": "INVALID_AAGUID" }`                    |

---

## Handler behavior

- Your handler only runs after successful verification and a successful `storeDeviceKey` write.
- A `consumeChallenge` that returns `false` (not throws) surfaces as `CHALLENGE_INVALID` — an expected condition (missing, expired, or already-consumed challenge), not a callback failure.
- Errors thrown by `consumeChallenge` or `storeDeviceKey` surface as `INVALID_FORMAT` with the original error message.
- Errors thrown by your handler are **not** caught — they propagate normally.

Import path: `@bradford-tech/supabase-integrity-attest` or `@bradford-tech/supabase-integrity-attest/attestation`

For usage examples, see [The withAttestation wrapper guide](/docs/with-attestation).
