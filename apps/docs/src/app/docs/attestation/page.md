---
title: Attestation
nextjs:
  metadata:
    title: Attestation
    description: How the one-time device attestation flow works and what each verification step protects against.
---

Attestation is the one-time process where a device proves it's running your real app on genuine Apple hardware. {% .lead %}

---

## The flow

1. Your app calls `DCAppAttestService.generateKey()` to create an ECDSA P-256 key pair in the Secure Enclave. This returns a `keyId` — the base64-encoded SHA-256 hash of the public key.

2. Your server generates a challenge (random bytes) and sends it to the app.

3. Your app calls `DCAppAttestService.attestKey(keyId, clientDataHash:)`, passing the SHA-256 hash of the challenge. Apple's servers return a CBOR-encoded attestation object containing a signed certificate chain.

4. Your app sends the attestation object, keyId, and the original challenge to your server.

5. Your server calls [`verifyAttestation()`](/docs/verify-attestation) to validate everything and extract the device's public key.

{% diagram name="attestation-flow" alt="Attestation data flow: iOS App generates a key pair in the Secure Enclave, attests it with Apple Servers, and sends the attestation to your server for verification." width=892 height=794 /%}

---

## What gets verified

Each check in the verification pipeline exists to prevent a specific attack:

### Certificate chain

The attestation object contains an X.509 certificate chain (`x5c`). The library verifies this chain against Apple's App Attestation Root CA. **Why:** An attacker who generates their own key pair can't forge Apple's certificate chain — only the Secure Enclave can produce a certificate signed by Apple.

### Nonce

The library computes `SHA-256(authData || challenge)` and compares it to a nonce embedded in the leaf certificate. **Why:** This binds the attestation to the specific challenge your server issued. An attacker can't reuse an attestation from a different session because the nonce won't match.

### AAGUID

The authenticator data contains an AAGUID (Authenticator Attestation Globally Unique Identifier). Production devices use `"appattest"` + 7 null bytes; development builds use `"appattestdevelop"`. **Why:** This lets you distinguish production from development attestations and reject the wrong environment.

### rpIdHash

The authenticator data starts with `SHA-256(appId)` where `appId` is your Team ID + bundle ID. **Why:** Prevents an attestation generated for a different app from being used against yours.

### credentialId and keyId

The credential ID in the authenticator data must match the keyId. **Why:** Ensures the attestation corresponds to the specific key the client claims to own.

### signCount

Must be exactly 0 for a new attestation. **Why:** A non-zero counter would indicate the key has been used before, which shouldn't happen for a fresh attestation.

---

## What you get back

`verifyAttestation()` returns an `AttestationResult`:

| Field          | Type         | Description                                                                           |
| -------------- | ------------ | ------------------------------------------------------------------------------------- |
| `publicKeyPem` | `string`     | PEM-encoded P-256 public key. Store this — you'll need it for every future assertion. |
| `receipt`      | `Uint8Array` | Opaque Apple receipt for fraud risk assessment. Store this alongside the key.         |
| `signCount`    | `number`     | Always `0` for attestations. Store this as the initial counter value.                 |

{% callout type="warning" title="Store the public key and receipt" %}
After a successful attestation, persist the `publicKeyPem`, `receipt`, and `signCount` for this device. You'll need the public key and counter for every subsequent assertion verification. The receipt is needed if you later want to use Apple's fraud assessment endpoints. For a complete edge function implementation, see the [verifying attestations guide](/docs/verifying-attestations).
{% /callout %}
