---
title: App Attest in 60 seconds
nextjs:
  metadata:
    title: App Attest in 60 seconds
    description: A minimal overview of how Apple App Attest works — just enough to use this library.
---

The minimum you need to know about Apple App Attest to use this library effectively. {% .lead %}

---

## Three phases

App Attest has three phases. The first happens once per device; the other two happen on every protected request.

### 1. [Attestation](/docs/attestation) (one-time)

Your app asks the Secure Enclave to generate a key pair, then sends the attestation object to Apple. Apple returns a signed certificate chain vouching for the key. Your app sends this to your server, which verifies it and stores the device's public key.

### 2. Challenge (per-request)

Before each protected request, your app asks your server for a fresh, single-use challenge (random bytes). This prevents replay attacks — an attacker can't reuse a captured request because the challenge will have expired.

### 3. [Assertion](/docs/assertion) (per-request)

Your app signs the request body (plus the challenge) with the Secure Enclave's private key and sends the signature alongside the request. Your server verifies the signature using the stored public key and checks that the counter has incremented.

---

## What your server does

This library handles phases 1 and 3 on the server side:

- **`verifyAttestation()`** — Called once when a device first registers. Validates Apple's certificate chain, extracts the public key, and returns it for storage. See the [verifying attestations guide](/docs/verifying-attestations) for a complete edge function example.
- **`verifyAssertion()`** — Called on every protected request. Verifies the signature and counter.

You're responsible for:

- Generating and storing challenges (random bytes, single-use, short-lived)
- Persisting the device's public key and sign count after attestation
- Updating the sign count after each assertion

{% callout type="note" title="Apple's documentation" %}
For the full specification, see Apple's [Validating Apps That Connect to Your Server](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server) and the [Attestation Object Validation Guide](https://developer.apple.com/documentation/devicecheck/validating-apps-that-connect-to-your-server#Verify-the-attestation).
{% /callout %}
