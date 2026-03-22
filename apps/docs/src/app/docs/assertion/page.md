---
title: Assertion
nextjs:
  metadata:
    title: Assertion
    description: How per-request assertion verification works — the hot path for every protected API call.
---

Assertions are the per-request signature checks that prove a request came from an attested device. This is the hot path. {% .lead %}

---

## The flow

1. Your app builds the API request and reads the raw request body.

2. Your app calls `DCAppAttestService.generateAssertion(keyId, clientDataHash:)`, passing the SHA-256 hash of the request body. The Secure Enclave signs the data and returns a CBOR-encoded assertion.

3. Your app sends the request with the assertion and a device identifier in headers.

4. Your server calls [`verifyAssertion()`](/docs/verify-assertion) with the assertion, the raw request body, the stored public key, and the previous sign count.

{% diagram name="assertion-flow" alt="Assertion data flow: iOS App signs the request via the Secure Enclave, sends the assertion in headers, and the server verifies the signature and updates the sign count." width=670 height=729 /%}

---

## What gets checked

### rpIdHash

Same as attestation — `SHA-256(appId)` must match the authenticator data. **Why:** Prevents assertions generated for a different app from being accepted.

### Sign count

The counter must be strictly greater than the previously stored value. **Why:** The Secure Enclave increments this counter on every assertion. If the counter hasn't increased, someone may be replaying a previously captured request.

### ECDSA signature

The library computes `SHA-256(authenticatorData || SHA-256(clientData))` and verifies the ECDSA P-256 signature against the stored public key. **Why:** This proves the request body was signed by the Secure Enclave's private key — which never leaves the device.

---

## What you get back

`verifyAssertion()` returns an `AssertionResult`:

| Field       | Type     | Description                                                                                           |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `signCount` | `number` | The new counter value. You must persist this — it becomes `previousSignCount` for the next assertion. |

---

## Why assertions are lightweight

Unlike attestation, assertion verification doesn't involve certificate chains or Apple network calls. It's a single ECDSA signature verification using the stored public key. This makes it fast enough to run on every API request without adding meaningful latency. For a complete implementation, see the [verifying assertions guide](/docs/verifying-assertions) or use the [`withAssertion()` wrapper](/docs/with-assertion) to eliminate boilerplate.

The `./assertion` subpath import avoids loading `asn1js` and `@noble/curves` entirely — keeping the bundle minimal for edge functions that only verify assertions.
