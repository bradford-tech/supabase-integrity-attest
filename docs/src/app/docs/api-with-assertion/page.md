---
title: withAssertion() reference
nextjs:
  metadata:
    title: withAssertion() reference
    description: Full API reference for the withAssertion middleware wrapper.
---

A middleware wrapper that handles assertion extraction, verification, atomic counter updates, and error responses. {% .lead %}

---

## Signature

```ts
function withAssertion(
  options: WithAssertionOptions,
  handler: (
    req: Request,
    context: AssertionContext,
  ) => Response | Promise<Response>,
): (req: Request) => Promise<Response>
```

---

## Options

| Field              | Type                                                                     | Required | Description                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appId`            | `string`                                                                 | Yes      | Your Team ID + bundle ID (e.g., `"TEAMID1234.com.example.app"`).                                                                                                          |
| `getDeviceKey`     | `(deviceId: string) => Promise<DeviceKey \| null>`                       | Yes      | Fetch the device's stored public key and counter. Return `null` if not found.                                                                                             |
| `commitSignCount`  | `(deviceId: string, newSignCount: number) => Promise<boolean>`           | Yes      | **Atomic compare-and-swap.** Update the stored counter only if the current stored value is strictly less than `newSignCount`. Return `true` if updated, `false` if stale. |
| `extractAssertion` | `ExtractAssertionFn`                                                     | No       | Custom extraction logic. Default reads from standard headers.                                                                                                             |
| `onError`          | `(error: AssertionError, req: Request) => Response \| Promise<Response>` | No       | Custom error response handler.                                                                                                                                            |

---

## Types

### DeviceKey

```ts
type DeviceKey = {
  publicKeyPem: string
  signCount: number
}
```

### AssertionTimings

Library-internal timing spans in milliseconds.

```ts
type AssertionTimings = {
  extractMs: number // Parse request headers + read body bytes
  getDeviceKeyMs: number // getDeviceKey callback wall-clock duration
  verifyMs: number // Cryptographic verification
  commitMs: number // commitSignCount callback wall-clock duration
}
```

### AssertionContext

Passed to your handler after successful verification and commit:

```ts
type AssertionContext = {
  deviceId: string // The device identifier from extraction
  signCount: number // The new counter value (already committed)
  rawBody: Uint8Array // The raw request body bytes
  timings: AssertionTimings // Library-internal spans
}
```

---

## Constants

```ts
const DEFAULT_ASSERTION_HEADER = 'X-App-Attest-Assertion'
const DEFAULT_DEVICE_ID_HEADER = 'X-App-Attest-Device-Id'
```

The default extractor reads the assertion from `X-App-Attest-Assertion` and the device ID from `X-App-Attest-Device-Id`. Both are importable constants.

---

## Default error responses

When verification fails and no `onError` is provided:

| Error code                | HTTP status | Response body                                                 |
| ------------------------- | ----------- | ------------------------------------------------------------- |
| `INVALID_FORMAT`          | 400         | `{ "error": "...", "code": "INVALID_FORMAT" }`                |
| `DEVICE_NOT_FOUND`        | 401         | `{ "error": "Device not found", "code": "DEVICE_NOT_FOUND" }` |
| `RP_ID_MISMATCH`          | 401         | `{ "error": "...", "code": "RP_ID_MISMATCH" }`                |
| `COUNTER_NOT_INCREMENTED` | 401         | `{ "error": "...", "code": "COUNTER_NOT_INCREMENTED" }`       |
| `SIGNATURE_INVALID`       | 401         | `{ "error": "...", "code": "SIGNATURE_INVALID" }`             |
| `SIGN_COUNT_STALE`        | 409         | `{ "error": "...", "code": "SIGN_COUNT_STALE" }`              |
| `INTERNAL_ERROR`          | 500         | `{ "error": "...", "code": "INTERNAL_ERROR" }`                |

---

## Handler behavior

- Your handler only runs after successful verification and a successful `commitSignCount` CAS.
- Errors thrown by `getDeviceKey` or `commitSignCount` are wrapped as `INTERNAL_ERROR`. See [Types & error codes](/docs/types-and-error-codes) for all error code definitions.
- A `commitSignCount` that returns `false` (not throws) surfaces as `SIGN_COUNT_STALE` — an expected race condition, not a callback failure.
- Errors thrown by your handler are **not** caught — they propagate normally.

Import path: `@bradford-tech/supabase-integrity-attest` or `@bradford-tech/supabase-integrity-attest/assertion`

For usage examples, see [The withAssertion wrapper guide](/docs/with-assertion).
