---
title: verifyAttestation()
nextjs:
  metadata:
    title: verifyAttestation()
    description: Full API reference for the verifyAttestation function.
---

Verifies an Apple App Attest attestation object and extracts the device's public key. {% .lead %}

---

## Signature

```ts
function verifyAttestation(
  appInfo: AppInfo,
  keyId: string,
  challenge: Uint8Array | string,
  attestation: Uint8Array | string,
  options?: VerifyAttestationOptions,
): Promise<AttestationResult>
```

---

## Parameters

| Parameter     | Type                       | Description                                                                               |
| ------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `appInfo`     | `AppInfo`                  | Your app's bundle ID and environment. See [AppInfo](/docs/types-and-error-codes#appinfo). |
| `keyId`       | `string`                   | Base64-encoded SHA-256 hash of the public key, from `DCAppAttestService.generateKey()`.   |
| `challenge`   | `Uint8Array \| string`     | The original challenge your server generated. If a string, treated as UTF-8 bytes.        |
| `attestation` | `Uint8Array \| string`     | The CBOR-encoded attestation object. If a string, decoded as base64.                      |
| `options`     | `VerifyAttestationOptions` | Optional. See below.                                                                      |

### VerifyAttestationOptions

| Field       | Type   | Default      | Description                                                                                                         |
| ----------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `checkDate` | `Date` | `new Date()` | Override the date used for certificate validity checks. Only needed when testing with Apple's expired test fixture. |

{% callout type="note" title="Testing with expired certificates" %}
Apple's published attestation test vector contains certificates that expired in April 2024. Pass `checkDate: new Date("2024-04-18T00:00:00Z")` when testing against this fixture.
{% /callout %}

---

## Returns

`Promise<AttestationResult>`

| Field          | Type         | Description                                                               |
| -------------- | ------------ | ------------------------------------------------------------------------- |
| `publicKeyPem` | `string`     | PEM-encoded SPKI P-256 public key. Store this for assertion verification. |
| `receipt`      | `Uint8Array` | Apple receipt bytes. Store alongside the public key.                      |
| `signCount`    | `number`     | Always `0` for attestations.                                              |

---

## Errors

Throws `AttestationError` with one of these codes (not exhaustive):

| Code                        | Cause                                                        | Resolution                                                                                    |
| --------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `INVALID_FORMAT`            | CBOR decoding failed, or `fmt` is not `"apple-appattest"`.   | Check that the client is sending the raw attestation object, not a wrapper.                   |
| `INVALID_CERTIFICATE_CHAIN` | Certificate chain failed validation against Apple's root CA. | Verify the device is using a genuine Apple attestation service. Check `checkDate` if testing. |
| `NONCE_MISMATCH`            | Computed nonce doesn't match the certificate nonce.          | Ensure you're passing the same challenge that was used during attestation.                    |

See [Types & error codes](/docs/types-and-error-codes) for the full list.

Import path: `@bradford-tech/supabase-integrity-attest` or `@bradford-tech/supabase-integrity-attest/attestation`

For a complete working example in a Supabase Edge Function, see the [verifying attestations guide](/docs/verifying-attestations).
