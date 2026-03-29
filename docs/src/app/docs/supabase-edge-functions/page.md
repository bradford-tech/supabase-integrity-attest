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

### Create a Supabase Edge Function

```shell
supabase functions new verify-attestation
supabase functions new verify-assertion
```

For complete working implementations, see the [verifying attestations](/docs/verifying-attestations) and [verifying assertions](/docs/verifying-assertions) guides.

### Add the library

```shell
# In your Supabase project
deno add jsr:@bradford-tech/supabase-integrity-attest
```

### Environment variables

Set your app's bundle ID as an environment variable:

```shell
# .env.local or Supabase dashboard
APP_ID=TEAMID1234.com.your.bundleid
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

You need a table to store device attestation data. Here's a minimal schema:

```sql
create table devices (
  device_id text primary key,
  user_id uuid references auth.users(id),
  public_key_pem text not null,
  sign_count integer not null default 0,
  receipt bytea,
  created_at timestamptz not null default now()
);

-- Index for quick lookups during assertion verification
create index idx_devices_user_id on devices(user_id);
```

The `device_id` is an identifier your app generates and sends with each request. The `public_key_pem` and `sign_count` come from the attestation result and are updated on each assertion.
