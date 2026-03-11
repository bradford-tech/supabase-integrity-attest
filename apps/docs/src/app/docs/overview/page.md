---
title: Overview
nextjs:
  metadata:
    title: Overview
    description: What supabase-integrity-attest does, why it exists, and how to install it.
---

Verify Apple App Attest attestations and assertions in Supabase Edge Functions using only the WebCrypto API. {% .lead %}

---

## The problem

Mobile apps ship with API keys baked into the binary. Anyone with a proxy tool like mitmproxy can extract them in minutes. IP-based rate limiting doesn't help — rotating proxies are cheap and plentiful.

The result: your API is open to abuse from scripts and bots that impersonate your app. You need a way to verify that a request actually came from your real app running on a real device.

---

## What App Attest gives you

Apple's [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) uses the Secure Enclave on iOS devices to generate a hardware-backed key pair. Apple signs a certificate vouching for that key, and your server can verify the certificate chain to confirm the key belongs to a genuine device running your app.

Once a device is attested, every subsequent API request can include a cryptographic assertion — a signature over the request body that proves it came from the attested device. Your server verifies the signature using the public key from the original attestation.

---

## What this library does

`@bradford-tech/supabase-integrity-attest` handles the server-side verification:

- **Attestation verification** — Decodes the CBOR attestation object, validates the X.509 certificate chain against Apple's root CA, verifies the nonce, and extracts the device's public key.
- **Assertion verification** — Verifies the ECDSA signature over the request body, checks the monotonic counter for replay protection, and confirms the request came from the attested device.

Everything uses the [WebCrypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), so it runs natively in Deno and Supabase Edge Functions with zero Node.js compatibility shims.

---

## Who it's for

Developers building iOS apps with [Expo](https://expo.dev/) or React Native that use [Supabase Edge Functions](https://supabase.com/docs/guides/functions) as their backend. If you're protecting API endpoints that should only be callable by your real app on real devices, this is your server-side verification layer.

---

## Install

### Deno / JSR

```shell
deno add jsr:@bradford-tech/supabase-integrity-attest
```

### Node.js / npm

```shell
npm install @bradford-tech/supabase-integrity-attest
```

### Subpath imports

If you only need assertion verification (the per-request hot path), import from the `./assertion` subpath to avoid loading the heavier attestation dependencies (`asn1js`, `@noble/curves`):

```ts
// Full library
import {
  verifyAttestation,
  verifyAssertion,
} from '@bradford-tech/supabase-integrity-attest'

// Assertion only — smaller bundle, no asn1js/@noble/curves
import {
  verifyAssertion,
  withAssertion,
} from '@bradford-tech/supabase-integrity-attest/assertion'

// Attestation only
import { verifyAttestation } from '@bradford-tech/supabase-integrity-attest/attestation'
```
