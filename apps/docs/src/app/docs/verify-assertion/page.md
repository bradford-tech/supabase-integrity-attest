---
title: verifyAssertion()
nextjs:
  metadata:
    title: verifyAssertion()
    description: Full API reference for the verifyAssertion function.
---

Verifies an Apple App Attest assertion — the per-request signature check. {% .lead %}

---

## Signature

```ts
function verifyAssertion(
  appInfo: AppInfo,
  assertion: Uint8Array | string,
  clientData: Uint8Array | string,
  publicKeyPem: string,
  previousSignCount: number,
): Promise<AssertionResult>
```

---

## Parameters

| Parameter           | Type                   | Description                                                                               |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| `appInfo`           | `AppInfo`              | Your app's bundle ID and environment. See [AppInfo](/docs/types-and-error-codes#appinfo). |
| `assertion`         | `Uint8Array \| string` | The CBOR-encoded assertion. If a string, decoded as base64.                               |
| `clientData`        | `Uint8Array \| string` | The raw request body that was signed. If a string, treated as UTF-8 bytes.                |
| `publicKeyPem`      | `string`               | PEM-encoded P-256 public key from a previous `verifyAttestation()` call.                  |
| `previousSignCount` | `number`               | The last stored counter value for this device.                                            |

---

## Returns

`Promise<AssertionResult>`

| Field       | Type     | Description                                                                                  |
| ----------- | -------- | -------------------------------------------------------------------------------------------- |
| `signCount` | `number` | The new counter value. Must be persisted — it becomes `previousSignCount` for the next call. |

---

## Errors

Throws `AssertionError` with one of these codes (not exhaustive):

| Code                      | Cause                                                                                                                 | Resolution                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `INVALID_FORMAT`          | CBOR decoding failed, authenticator data is malformed, DER signature is invalid, or PEM public key can't be imported. | Check that the client is sending the raw assertion, not a wrapper.                                 |
| `COUNTER_NOT_INCREMENTED` | `signCount` is not greater than `previousSignCount`.                                                                  | Possible replay attack, or your stored counter is stale.                                           |
| `SIGNATURE_INVALID`       | ECDSA signature verification failed.                                                                                  | The assertion was not signed by the expected key, or the clientData doesn't match what was signed. |

See [Types & error codes](/docs/types-and-error-codes) for the full list.

Import path: `@bradford-tech/supabase-integrity-attest` or `@bradford-tech/supabase-integrity-attest/assertion`

For a complete working example in a Supabase Edge Function, see the [verifying assertions guide](/docs/verifying-assertions).
