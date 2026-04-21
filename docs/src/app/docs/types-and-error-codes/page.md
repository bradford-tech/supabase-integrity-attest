---
title: Types & error codes
nextjs:
  metadata:
    title: Types & error codes
    description: All exported types, interfaces, and error codes with descriptions.
---

Every type and error code exported by the library. {% .lead %}

---

## Types

### AppInfo

```ts
interface AppInfo {
  appId: string // Team ID + bundle ID, e.g. "TEAMID1234.com.example.app"
  developmentEnv?: boolean // Default false. true = development AAGUID (attestation only).
}
```

Used by `verifyAttestation()`, `verifyAssertion()`, `withAttestation()`, and `withAssertion()`. The `developmentEnv` field only affects attestation verification (AAGUID selection); assertions ignore it.

### AttestationResult

```ts
interface AttestationResult {
  publicKeyPem: string // PEM-encoded SPKI P-256 public key
  receipt: Uint8Array // Apple receipt for fraud risk assessment
  signCount: number // Always 0 for attestations
}
```

Returned by `verifyAttestation()`. Persist all three fields.

### AssertionResult

```ts
interface AssertionResult {
  signCount: number // New counter value — must be persisted
}
```

Returned by `verifyAssertion()`.

### VerifyAttestationOptions

```ts
interface VerifyAttestationOptions {
  checkDate?: Date // Override date for certificate validity checks
}
```

### DeviceKey

```ts
type DeviceKey = {
  publicKeyPem: string // PEM from attestation result
  signCount: number // Last stored counter value
}
```

Used by `withAssertion()`'s `getDeviceKey` callback.

### AssertionTimings

```ts
type AssertionTimings = {
  extractMs: number // Parse request headers + read body bytes
  getDeviceKeyMs: number // getDeviceKey callback wall-clock duration
  verifyMs: number // Cryptographic verification
  commitMs: number // commitSignCount callback wall-clock duration
}
```

Library-internal span measurements passed to `withAssertion()` handlers via `ctx.timings`.

### AssertionContext

```ts
type AssertionContext = {
  deviceId: string // Device identifier from extraction
  signCount: number // New counter value (already committed)
  rawBody: Uint8Array // Raw request body bytes
  timings: AssertionTimings // Library-internal spans
}
```

Passed to your `withAssertion()` handler.

### WithAssertionOptions

```ts
type WithAssertionOptions = {
  appId: string
  getDeviceKey: (deviceId: string) => Promise<DeviceKey | null>
  commitSignCount: (deviceId: string, newSignCount: number) => Promise<boolean>
  extractAssertion?: ExtractAssertionFn
  onError?: (
    error: AssertionError,
    req: Request,
  ) => Response | Promise<Response>
}
```

`commitSignCount` must be an atomic compare-and-swap — see the [`withAssertion` guide](/docs/with-assertion) for details.

### ExtractAssertionFn

```ts
type ExtractAssertionFn = (req: Request) => Promise<{
  assertion: string
  deviceId: string
  clientData: Uint8Array
}>
```

Custom extraction callback for `withAssertion()`. The default reads from `X-App-Attest-Assertion` and `X-App-Attest-Device-Id` headers.

### AttestationTimings

```ts
type AttestationTimings = {
  extractMs: number // Parse body + decode base64 fields
  consumeChallengeMs: number // consumeChallenge callback wall-clock duration
  verifyMs: number // Cryptographic attestation verification
  storeDeviceKeyMs: number // storeDeviceKey callback wall-clock duration
}
```

Library-internal span measurements passed to `withAttestation()` handlers via `ctx.timings`.

### AttestationContext

```ts
type AttestationContext = {
  deviceId: string // Apple-issued keyId from the request
  publicKeyPem: string // PEM-encoded ECDSA P-256 public key
  signCount: number // Always 0 for a fresh attestation
  receipt: Uint8Array // Raw Apple receipt bytes
  timings: AttestationTimings // Library-internal spans
}
```

Passed to your `withAttestation()` handler.

### WithAttestationOptions

```ts
type WithAttestationOptions = {
  appId: string
  developmentEnv?: boolean
  consumeChallenge: (challenge: Uint8Array) => Promise<boolean>
  storeDeviceKey: (row: {
    deviceId: string
    publicKeyPem: string
    signCount: number
    receipt: Uint8Array
  }) => Promise<void>
  extractAttestation?: ExtractAttestationFn
  onError?: (
    error: AttestationError,
    req: Request,
  ) => Response | Promise<Response>
}
```

`consumeChallenge` must be an atomic single-use consume — see the [`withAttestation` guide](/docs/with-attestation) for details.

### ExtractAttestationFn

```ts
type ExtractAttestationFn = (req: Request) => Promise<{
  deviceId: string
  challenge: Uint8Array // raw bytes for consumeChallenge DB lookup
  challengeAsSent: string // original string the client SDK hashed
  attestation: Uint8Array
}>
```

Custom extraction callback for `withAttestation()`. The default reads a JSON body of the shape `{ keyId: string, challenge: string, attestation: string }` where `challenge` and `attestation` are base64-encoded. `challengeAsSent` is the original challenge string before base64 decoding — the middleware hashes it to produce `clientDataHash`, matching what client SDKs hash before passing to Apple.

---

## AttestationErrorCode

`AttestationError` is thrown by [`verifyAttestation()`](/docs/verify-attestation) and [`withAttestation()`](/docs/api-with-attestation). It extends `Error` with a typed `code` property.

```ts
class AttestationError extends Error {
  readonly name: 'AttestationError'
  readonly code: AttestationErrorCode
}
```

### INVALID_FORMAT

The attestation object couldn't be decoded (bad CBOR, bad base64) or the format field is not `"apple-appattest"`. Also thrown by `withAttestation()` when the request body can't be parsed as JSON or is missing required fields.

**Resolution:** Verify the client is sending the raw attestation object from `attestKeyAsync()`, base64-encoded, in a JSON body with `keyId`, `challenge`, and `attestation` keys.

### INVALID_CERTIFICATE_CHAIN

The X.509 certificate chain failed validation against Apple's App Attestation Root CA. This includes expired certificates, broken chain linkage, or invalid signatures.

**Resolution:** Verify the device is using genuine Apple attestation. If testing, pass the `checkDate` option to account for expired test certificates.

### NONCE_MISMATCH

The computed nonce (`SHA-256(authData || clientDataHash)`) doesn't match the nonce in the leaf certificate.

**Resolution:** If using `verifyAttestation()` directly, ensure the `clientDataHash` parameter is `SHA-256(challenge)` — NOT the raw challenge bytes. Client SDKs (Expo's `attestKeyAsync`, native `DCAppAttestService` wrappers) hash the challenge before passing to Apple, so the server must do the same. If using the `withAttestation` middleware, this hashing is handled automatically — check that the challenge hasn't expired or been consumed already instead.

### RP_ID_MISMATCH

`SHA-256(appInfo.appId)` doesn't match the `rpIdHash` in the authenticator data.

**Resolution:** Check that `appInfo.appId` is your full Team ID + bundle ID (e.g., `"TEAMID1234.com.example.app"`). This must match what the client used.

### KEY_ID_MISMATCH

The `keyId` doesn't match the public key hash or credential ID in the attestation.

**Resolution:** Ensure the client sends the `keyId` from `generateKeyAsync()` without modification.

### INVALID_COUNTER

`signCount` is not `0` in the attestation.

**Resolution:** This attestation object has been used before or is malformed. Request a fresh attestation from the client.

### INVALID_AAGUID

The AAGUID in the authenticator data doesn't match the expected environment.

**Resolution:** Check `appInfo.developmentEnv`. Production devices use `"appattest"` + 7 null bytes; development builds use `"appattestdevelop"`.

### CHALLENGE_INVALID

`withAttestation()` only. The `consumeChallenge` callback returned `false`, meaning the challenge was missing, expired, or already consumed.

**Resolution:** Check that the client is sending the same challenge it received from your `/challenge` endpoint, and that the challenge hasn't expired (60 seconds by default) or already been used for a prior attestation attempt.

### INTERNAL_ERROR

`withAttestation()` only. The `consumeChallenge` or `storeDeviceKey` callback threw an error, or an unexpected non-`AttestationError` escaped the middleware pipeline. The HTTP response body contains only a static, client-safe message — the original error is deliberately NOT reflected to the caller to avoid leaking database schema details or driver diagnostics through the unauthenticated attestation endpoint.

**Resolution:** The original error is available via `error.cause` inside a custom `onError` handler — log it there for debugging. Check your database connection and the logic inside your `consumeChallenge` / `storeDeviceKey` implementations.

---

## AssertionErrorCode

`AssertionError` is thrown by [`verifyAssertion()`](/docs/verify-assertion) and [`withAssertion()`](/docs/api-with-assertion). It extends `Error` with a typed `code` property.

```ts
class AssertionError extends Error {
  readonly name: 'AssertionError'
  readonly code: AssertionErrorCode
}
```

### INVALID_FORMAT

The assertion couldn't be decoded (bad CBOR, bad base64), the authenticator data is malformed, the DER signature is invalid, or the PEM public key can't be imported.

**Resolution:** Verify the client is sending the raw assertion from `generateAssertionAsync()`, base64-encoded. Check that the stored public key PEM is valid.

### RP_ID_MISMATCH

`SHA-256(appInfo.appId)` doesn't match the `rpIdHash` in the assertion's authenticator data.

**Resolution:** Same as attestation — check `appInfo.appId`.

### COUNTER_NOT_INCREMENTED

The assertion's `signCount` is not strictly greater than `previousSignCount`.

**Resolution:** This may indicate a replay attack. Verify your counter persistence — if the counter wasn't updated after the last successful assertion, valid requests will be rejected.

### SIGNATURE_INVALID

ECDSA signature verification failed.

**Resolution:** The assertion was signed by a different key than expected, or the `clientData` bytes don't match what was signed. Ensure you're passing the raw request body as `clientData`.

### DEVICE_NOT_FOUND

`withAssertion()` only. The `getDeviceKey` callback returned `null`.

**Resolution:** The device hasn't been attested yet, or the device ID is incorrect. The client should re-attest.

### SIGN_COUNT_STALE

`withAssertion()` only. The `commitSignCount` callback returned `false`, meaning another concurrent request already advanced the stored counter past this assertion's value.

**Resolution:** This is an expected race condition under concurrent load, not a client bug. Serialize rapid-fire requests from the same device client-side, or accept occasional stale rejections as the correct behavior under strict monotonic counter semantics.

### INTERNAL_ERROR

`withAssertion()` only. The `getDeviceKey` or `commitSignCount` callback threw an error.

**Resolution:** Check your database connection and storage logic. The original error is available via `error.cause`.

---

## Error handling pattern

```ts
import {
  verifyAttestation,
  AttestationError,
  AttestationErrorCode,
} from '@bradford-tech/supabase-integrity-attest'

try {
  // clientDataHash = SHA-256(challenge) — most client SDKs hash internally
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(challenge)),
  )
  const result = await verifyAttestation(
    appInfo,
    keyId,
    clientDataHash,
    attestation,
  )
  // Success — store result
} catch (error) {
  if (error instanceof AttestationError) {
    switch (error.code) {
      case AttestationErrorCode.NONCE_MISMATCH:
      case AttestationErrorCode.RP_ID_MISMATCH:
      case AttestationErrorCode.KEY_ID_MISMATCH:
        // Client error — return 401
        break
      case AttestationErrorCode.INVALID_FORMAT:
        // Bad request — return 400
        break
      default:
        // Unexpected — log and return 500
        console.error('Attestation failed:', error.code, error.message)
    }
  }
}
```
