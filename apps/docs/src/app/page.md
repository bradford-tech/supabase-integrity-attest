---
title: supabase-integrity-attest
nextjs:
  metadata:
    description: 'Server-side Apple App Attest verification for Supabase Edge Functions — verify attestations and assertions entirely on WebCrypto, no Node.js required.'
---

Server-side Apple App Attest verification for Supabase Edge Functions, built entirely on WebCrypto. {% .lead %}

{% quick-links %}

{% quick-link title="New to App Attest?" icon="installation" href="/docs/overview" description="Understand the problem this library solves and get set up in minutes." /%}

{% quick-link title="Ready to integrate?" icon="plugins" href="/docs/supabase-edge-functions" description="Jump straight to setting up verification in your Supabase Edge Functions." /%}

{% quick-link title="API reference" icon="theming" href="/docs/verify-attestation" description="Full function signatures, parameter details, and error code reference." /%}

{% quick-link title="Design & architecture" icon="presets" href="/docs/design-and-architecture" description="Understand the implementation: why WebCrypto, why not pkijs, and the verification pipeline." /%}

{% /quick-links %}

---

## What this library does

Mobile apps embed API keys that are trivially extractable via MITM tools like mitmproxy. IP-based rate limiting is just as easily bypassed with rotating proxies. Apple's [App Attest](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) solves this by leveraging the Secure Enclave to create hardware-backed cryptographic proof that requests originate from a genuine app on a real device.

This library verifies those proofs server-side. It handles the full attestation verification pipeline (CBOR decoding, X.509 certificate chain validation, nonce verification, key extraction) and the per-request assertion signature check — all using the WebCrypto API so it runs natively in Deno and Supabase Edge Functions without any Node.js compatibility issues.

- **WebCrypto only** — zero dependency on `node:crypto`. Runs in Deno Deploy, Supabase Edge Functions, and any runtime with `crypto.subtle`.
- **Full verification pipeline** — CBOR decode, X.509 certificate chain validation, nonce check, key extraction, ECDSA signature verify. Nothing is skipped or stubbed.
- **Supabase-native** — designed for Supabase Edge Functions from day one, but works with any Deno or Node.js server.
- **No compatibility hacks** — no `pkijs` (crashes in Supabase's edge runtime), no `@peculiar/x509` (global side effects from `tsyringe`). Just standards-based crypto.

---

## Assertion middleware

Once a device is attested, use `withAssertion()` to verify every subsequent request with a single wrapper:

```ts
import { withAssertion } from '@bradford-tech/supabase-integrity-attest/assertion'

Deno.serve(
  withAssertion(
    async (req, ctx) => {
      // ctx.deviceKey is verified — the request is from a genuine device
      return new Response('OK')
    },
    {
      getDeviceKey: async (keyId) => {
        /* look up public key + sign count from your database */
      },
      updateSignCount: async (keyId, counter) => {
        /* persist the new counter value */
      },
    },
  ),
)
```

`withAssertion()` extracts the assertion from the request, verifies the signature against the stored public key, checks the counter to prevent replay attacks, and hands you a verified `ctx.deviceKey`. See the [assertion verification guide](/docs/verify-assertion) and [API reference](/docs/with-assertion) for the full details.

---

## Install

```shell
# Deno / JSR
deno add jsr:@bradford-tech/supabase-integrity-attest
```

```shell
# Node.js / npm
npm install @bradford-tech/supabase-integrity-attest
```
