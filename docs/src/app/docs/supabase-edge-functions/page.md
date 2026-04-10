---
title: Supabase Edge Functions
nextjs:
  metadata:
    title: Supabase Edge Functions
    description: Why this library exists for Supabase Edge Functions, and how to set up your project.
---

This library was built specifically for Supabase Edge Functions. Here's why, and how to get started. {% .lead %}

---

## Why a new library?

Supabase Edge Functions run on Deno, which has excellent WebCrypto support but incomplete Node.js compatibility. The existing App Attest verification libraries all hit Deno-specific issues:

- **`appattest-checker-node`** — Uses `node:crypto`'s `X509Certificate.prototype.verify()`, which throws `ERR_NOT_IMPLEMENTED` in Deno.
- **`pkijs`** — Crashes on module load. It calls `setEngine(self.crypto.name, ...)` at import time, but `self.crypto.name` is `undefined` in Supabase's runtime. This writes to `globalThis['undefined']`, which is read-only.
- **`@peculiar/x509`** — Depends on `tsyringe` and `reflect-metadata`, which use decorator metadata polyfills with global side effects. These are unreliable in edge isolates.

This library uses only the WebCrypto API (`crypto.subtle`), which Deno fully supports. No Node.js shims, no global side effects, no module-load crashes.

---

## Project setup

### 1. Scaffold the two core endpoints

Every project needs exactly two App Attest endpoints: one that issues challenges, and one that verifies attestations (one-time device registration). Every protected business endpoint then uses the `withAssertion` middleware as a one-line wrapper — you don't write a separate `verify-assertion` endpoint.

```shell
supabase functions new challenge
supabase functions new verify-attestation
```

Your own business endpoints (`hello`, `checkout`, `premium-feature`, etc.) are wrapped with `withAssertion` — see the [`withAssertion` guide](/docs/with-assertion) for the one-liner pattern.

### 2. Add the library

```shell
# In your Supabase project
deno add jsr:@bradford-tech/supabase-integrity-attest
```

### 3. Environment variables

Set your app's bundle ID and environment:

```shell
# .env.local or Supabase dashboard
APP_ID=TEAMID1234.com.your.bundleid
ENVIRONMENT=development  # or "production"
```

In your edge function:

```ts
const appInfo = {
  appId: Deno.env.get('APP_ID')!,
  developmentEnv: Deno.env.get('ENVIRONMENT') !== 'production',
}
```

---

## Database schema

Two tables — one for verified devices, one for the short-lived challenge nonces. The `app_attest_` prefix keeps them from colliding with any existing `devices` or `challenges` tables in your project.

```sql
create table app_attest_devices (
  device_id      text primary key,
  public_key_pem text not null,
  sign_count     bigint not null default 0 check (sign_count >= 0),
  receipt        bytea,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

create table app_attest_challenges (
  challenge   bytea primary key,
  purpose     text not null check (purpose in ('attestation', 'assertion')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index app_attest_challenges_expires_at_idx
  on app_attest_challenges (expires_at);
```

The `device_id` is the Apple-issued `keyId` from `generateKeyAsync()`. The `public_key_pem`, `sign_count`, and `receipt` come from the attestation result and are updated on each assertion. The `purpose` column on `app_attest_challenges` lets you reject challenges being replayed across attestation/assertion contexts.

---

## The three moving parts

1. **Issue a challenge** — your `challenge` edge function generates a random nonce, stores it in `app_attest_challenges` with a ~60 second expiry, and returns the base64 bytes to the client.
2. **Verify the attestation** — your `verify-attestation` edge function consumes a challenge (one-time), cryptographically verifies the attestation with [`withAttestation`](/docs/with-attestation), and persists the verified key into `app_attest_devices`.
3. **Protect every business endpoint** — every other edge function wraps its handler with [`withAssertion`](/docs/with-assertion). No separate `verify-assertion` endpoint — the assertion check becomes a one-line middleware that runs before your business logic:

```ts
import { withAssertion } from '@bradford-tech/supabase-integrity-attest/assertion'

const protect = (handler) =>
  withAssertion(
    {
      appId: Deno.env.get('APP_ID')!,
      getDeviceKey: /* lookup from app_attest_devices */,
      commitSignCount: /* atomic CAS against app_attest_devices */,
    },
    handler,
  )

// Your business endpoint is now one line of protection:
Deno.serve(protect(async (_req, ctx) => {
  return Response.json({ hello: ctx.deviceId })
}))
```

The [`withAssertion` guide](/docs/with-assertion) shows the full `protect` helper, and the [`withAttestation` guide](/docs/with-attestation) shows the attestation-side equivalent.
