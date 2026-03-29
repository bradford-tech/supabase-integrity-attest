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
  developmentEnv?: boolean // Default false. true = development AAGUID.
}
```

Used by `verifyAttestation()`, `verifyAssertion()`, and `withAssertion()`.

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

### AssertionContext

```ts
type AssertionContext = {
  deviceId: string // Device identifier from extraction
  signCount: number // New counter value (already persisted)
  rawBody: Uint8Array // Raw request body bytes
}
```

Passed to your `withAssertion()` handler.

### WithAssertionOptions

```ts
type WithAssertionOptions = {
  appId: string
  developmentEnv?: boolean
  getDeviceKey: (deviceId: string) => Promise<DeviceKey | null>
  updateSignCount: (deviceId: string, newSignCount: number) => Promise<void>
  extractAssertion?: ExtractAssertionFn
  onError?: (
    error: AssertionError,
    req: Request,
  ) => Response | Promise<Response>
}
```

### ExtractAssertionFn

```ts
type ExtractAssertionFn = (req: Request) => Promise<{
  assertion: string
  deviceId: string
  clientData: Uint8Array
}>
```

Custom extraction callback for `withAssertion()`. The default reads from `X-App-Attest-Assertion` and `X-App-Attest-Device-Id` headers.

---

## AttestationErrorCode

`AttestationError` is thrown by [`verifyAttestation()`](/docs/verify-attestation). It extends `Error` with a typed `code` property.

```ts
class AttestationError extends Error {
  readonly name: 'AttestationError'
  readonly code: AttestationErrorCode
}
```

### INVALID_FORMAT

The attestation object couldn't be decoded (bad CBOR, bad base64) or the format field is not `"apple-appattest"`.

**Resolution:** Verify the client is sending the raw attestation object from `DCAppAttestService.attestKey()`, base64-encoded.

### INVALID_CERTIFICATE_CHAIN

The X.509 certificate chain failed validation against Apple's App Attestation Root CA. This includes expired certificates, broken chain linkage, or invalid signatures.

**Resolution:** Verify the device is using genuine Apple attestation. If testing, pass the `checkDate` option to account for expired test certificates.

### NONCE_MISMATCH

The computed nonce (`SHA-256(authData || challenge)`) doesn't match the nonce in the leaf certificate.

**Resolution:** Ensure you're passing the exact same challenge value that was active when the client called `attestKey()`. Check that the challenge hasn't been URL-encoded or otherwise transformed.

### RP_ID_MISMATCH

`SHA-256(appInfo.appId)` doesn't match the `rpIdHash` in the authenticator data.

**Resolution:** Check that `appInfo.appId` is your full Team ID + bundle ID (e.g., `"TEAMID1234.com.example.app"`). This must match what the client used.

### KEY_ID_MISMATCH

The `keyId` doesn't match the public key hash or credential ID in the attestation.

**Resolution:** Ensure the client sends the `keyId` from `generateKey()` without modification.

### INVALID_COUNTER

`signCount` is not `0` in the attestation.

**Resolution:** This attestation object has been used before or is malformed. Request a fresh attestation from the client.

### INVALID_AAGUID

The AAGUID in the authenticator data doesn't match the expected environment.

**Resolution:** Check `appInfo.developmentEnv`. Production devices use `"appattest"` + 7 null bytes; development builds use `"appattestdevelop"`.

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

**Resolution:** Verify the client is sending the raw assertion from `generateAssertion()`, base64-encoded. Check that the stored public key PEM is valid.

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

### INTERNAL_ERROR

`withAssertion()` only. The `getDeviceKey` or `updateSignCount` callback threw an error.

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
  const result = await verifyAttestation(appInfo, keyId, challenge, attestation)
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
