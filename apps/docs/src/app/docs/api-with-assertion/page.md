---
title: withAssertion() reference
nextjs:
  metadata:
    title: withAssertion() reference
    description: Full API reference for the withAssertion middleware wrapper.
---

A middleware wrapper that handles assertion extraction, verification, counter updates, and error responses. {% .lead %}

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

| Field              | Type                                                                     | Required | Description                                                                   |
| ------------------ | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------- |
| `appId`            | `string`                                                                 | Yes      | Your Team ID + bundle ID (e.g., `"TEAMID1234.com.example.app"`).              |
| `developmentEnv`   | `boolean`                                                                | No       | Default `false`. Set `true` for development AAGUID.                           |
| `getDeviceKey`     | `(deviceId: string) => Promise<DeviceKey \| null>`                       | Yes      | Fetch the device's stored public key and counter. Return `null` if not found. |
| `updateSignCount`  | `(deviceId: string, newSignCount: number) => Promise<void>`              | Yes      | Persist the updated counter after successful verification.                    |
| `extractAssertion` | `ExtractAssertionFn`                                                     | No       | Custom extraction logic. Default reads from standard headers.                 |
| `onError`          | `(error: AssertionError, req: Request) => Response \| Promise<Response>` | No       | Custom error response handler.                                                |

---

## Types

### DeviceKey

```ts
type DeviceKey = {
  publicKeyPem: string
  signCount: number
}
```

### AssertionContext

Passed to your handler after successful verification:

```ts
type AssertionContext = {
  deviceId: string // The device identifier from extraction
  signCount: number // The new counter value (already persisted)
  rawBody: Uint8Array // The raw request body bytes
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
| `INTERNAL_ERROR`          | 500         | `{ "error": "...", "code": "INTERNAL_ERROR" }`                |

---

## Handler behavior

- Your handler only runs after successful verification and counter update.
- Errors thrown by `getDeviceKey` or `updateSignCount` are wrapped as `INTERNAL_ERROR`.
- Errors thrown by your handler are **not** caught — they propagate normally.

Import path: `@bradford-tech/supabase-integrity-attest` or `@bradford-tech/supabase-integrity-attest/assertion`

For usage examples, see [The withAssertion wrapper guide](/docs/with-assertion).
