---
title: Challenges, nonces & security
nextjs:
  metadata:
    title: Challenges, nonces & security
    description: Challenge lifecycle, nonce derivation, and what App Attest does and doesn't prove.
---

Challenges and nonces are what make attestations and assertions unforgeable. This page covers how they work and the security guarantees you get. {% .lead %}

---

## Challenge lifecycle

A challenge is random bytes your server generates and sends to the client before each attestation or assertion. The rules:

1. **Server-generated** — minimum 16 random bytes from a CSPRNG.
2. **Single-use** — consume the challenge after verification. Never accept the same challenge twice.
3. **Short-lived** — expire after 30-60 seconds. A challenge that sits around is a replay vector.
4. **Stored server-side** — the client sends the challenge back, but you verify it against your stored copy.

This library does not manage challenges. You generate them, store them, and expire them. The library verifies that the attestation or assertion was created with the correct challenge.

---

## Nonce derivation

The nonce is a computed value that binds the attestation or assertion to the specific request. The client and server compute it independently, and they must match.

### Attestation nonce

```text
nonce = SHA-256(authData || challenge)
```

The library computes this from the raw authenticator data and the challenge you pass to `verifyAttestation()`. It then compares the result to the nonce embedded in the leaf certificate. If they don't match, the attestation was created with a different challenge.

### Assertion signature

```text
clientDataHash = SHA-256(clientData)
message = authenticatorData || clientDataHash
```

The client's Secure Enclave signs `SHA-256(message)` using ECDSA P-256. The library computes `nonce = SHA-256(authenticatorData || clientDataHash)` and passes `nonce` to WebCrypto's `verify()` with `hash: "SHA-256"`.

---

## What App Attest proves

App Attest gives you a strong guarantee with clear boundaries:

**It proves:**

- The request was signed by a key pair generated in a genuine Apple device's Secure Enclave
- The key is associated with your specific app bundle ID
- The Secure Enclave's counter has incremented (no replay)

**It does not prove:**

- The user's identity — App Attest is device-level, not user-level
- The device is not jailbroken — a jailbroken device with a functioning Secure Enclave can still attest
- The request content is "valid" — App Attest verifies that the request came from your app, not that the request makes sense for your business logic

---

## Counter tracking

The Secure Enclave maintains a monotonically increasing counter (`signCount`) that increments on every assertion. Your server must:

1. Store the counter from the attestation result (always `0`).
2. After each assertion, verify the new counter is strictly greater than the stored value.
3. Update the stored counter to the new value.

A counter that hasn't increased means either a replay attack or a bug in your counter persistence. Either way, reject the request.

---

## Graceful degradation

Not all iOS devices support App Attest. It requires iOS 14+ and a device with a Secure Enclave (all iPhones since iPhone 5s, all iPads since iPad Air). Devices running on simulators or older hardware won't support it.

Your app should check `DCAppAttestService.shared.isSupported` and implement a tiered policy:

- **Attested devices** — full trust, normal rate limits
- **Unattested devices** — reduced trust, stricter rate limits, additional verification

---

## Constant-time comparisons

This library uses constant-time byte comparisons for all nonce and hash verification. This prevents timing attacks where an attacker could measure response times to learn partial information about expected values. You don't need to do anything — it's handled internally.
