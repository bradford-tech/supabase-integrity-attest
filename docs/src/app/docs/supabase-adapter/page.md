---
title: Supabase adapter
nextjs:
  metadata:
    title: Supabase adapter
    description: Ready-made storage callbacks and challenge lifecycle for Supabase, via createSupabaseAdapter().
---

`createSupabaseAdapter()` gives you the storage callbacks and challenge lifecycle the middleware needs, backed by two Postgres tables — no hand-written glue code. {% .lead %}

---

## What it is

The `withAttestation()` and `withAssertion()` wrappers are storage-agnostic: you supply `consumeChallenge`, `storeDeviceKey`, `getDeviceKey`, and `commitSignCount` callbacks. On Supabase those callbacks are always the same few queries, so the `/supabase` subpath ships them ready-made:

```ts
import { createSupabaseAdapter } from '@bradford-tech/supabase-integrity-attest/supabase'

const adapter = createSupabaseAdapter(supabase)
```

The adapter object contains all four middleware callbacks plus `issueChallenge()` for your challenge endpoint. Spread it into the middleware options and you are done.

## Nothing extra to install

`@supabase/supabase-js` is **not** a dependency of this library. The client parameter is typed structurally against the small PostgREST-builder surface the adapter actually uses (`from().insert/upsert/delete/select/update` with `eq`/`gt`/`lt`/`maybeSingle`), so any recent supabase-js client satisfies it. Create the client yourself with the **service-role key** — the tables are RLS-locked to service-role access:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
```

## Schema

The canonical migration ships with the package at [`sql/app_attest.sql`](https://github.com/bradford-tech/supabase-integrity-attest/blob/main/packages/lib/sql/app_attest.sql). Copy it into your Supabase project's migrations. It creates:

- **`app_attest_devices`** — verified device keys: `device_id` (Apple's keyId, primary key), `public_key_pem`, `sign_count`, `receipt`, timestamps.
- **`app_attest_challenges`** — short-lived single-use nonces: `challenge` (bytea, primary key), `purpose` (`attestation` or `assertion`), `expires_at` (indexed).

Both tables have row-level security enabled with **no policies** — only the service-role key can touch them. The migration also schedules a pg_cron sweep that deletes expired, never-consumed challenges every 10 minutes.

## Quickstart

Three edge functions cover the whole flow.

**1. Challenge endpoint** — issues a one-time nonce:

```ts
// supabase/functions/challenge/index.ts
import { createSupabaseAdapter } from '@bradford-tech/supabase-integrity-attest/supabase'

const adapter = createSupabaseAdapter(supabase)

Deno.serve(async () => {
  const { challengeBase64, expiresAt } =
    await adapter.issueChallenge('attestation')
  return Response.json({ challenge: challengeBase64, expiresAt })
})
```

**2. Attestation endpoint** — registers a device:

```ts
// supabase/functions/attest/index.ts
import { withAttestation } from '@bradford-tech/supabase-integrity-attest/attestation'
import { createSupabaseAdapter } from '@bradford-tech/supabase-integrity-attest/supabase'

const adapter = createSupabaseAdapter(supabase)

Deno.serve(
  withAttestation(
    { appId: Deno.env.get('APP_ATTEST_APP_ID')!, ...adapter },
    (_req, ctx) => Response.json({ deviceId: ctx.deviceId }),
  ),
)
```

**3. Any protected endpoint** — verifies assertions:

```ts
// supabase/functions/protected/index.ts
import { withAssertion } from '@bradford-tech/supabase-integrity-attest/assertion'
import { createSupabaseAdapter } from '@bradford-tech/supabase-integrity-attest/supabase'

const adapter = createSupabaseAdapter(supabase)

Deno.serve(
  withAssertion(
    { appId: Deno.env.get('APP_ATTEST_APP_ID')!, ...adapter },
    (_req, ctx) => Response.json({ ok: true, deviceId: ctx.deviceId }),
  ),
)
```

The spread works because the adapter's method names match the middleware option names exactly. `withAttestation` picks up `consumeChallenge` and `storeDeviceKey`; `withAssertion` picks up `getDeviceKey` and `commitSignCount`.

`consumeChallenge` defaults to `purpose = "attestation"` — the assertion path's replay protection comes from the sign counter, not challenges. If you also want assertion-freshness challenges, call `adapter.issueChallenge('assertion')` and consume them in your handler with `adapter.consumeChallenge(bytes, 'assertion')`.

## Options

```ts
function createSupabaseAdapter(
  client: SupabaseLikeClient,
  options?: SupabaseAdapterOptions,
): SupabaseAdapter
```

| Field                 | Type     | Default                   | Description                          |
| --------------------- | -------- | ------------------------- | ------------------------------------ |
| `devicesTable`        | `string` | `"app_attest_devices"`    | Device-keys table name.              |
| `challengesTable`     | `string` | `"app_attest_challenges"` | Challenges table name.               |
| `challengeTtlSeconds` | `number` | `60`                      | Challenge time-to-live when issuing. |

## Semantics

- **Challenges** are 32 random bytes (`crypto.getRandomValues`), stored as bytea with a TTL. Consumption is a single atomic `DELETE ... RETURNING` filtered on purpose and `expires_at` — a challenge can never be used twice, even under concurrent requests. Expiry is stamped and evaluated against the edge function's clock (PostgREST filters can't call `now()`), so a few seconds of clock skew between isolates shifts the effective window; the pg_cron sweep uses the database clock.
- **`storeDeviceKey`** is an UPSERT keyed on `device_id`, so re-attesting a device replaces its key row instead of failing.
- **`commitSignCount`** is a compare-and-swap: `UPDATE ... WHERE device_id = $1 AND sign_count < $2`. It returns `false` when a concurrent request already advanced the counter, which the middleware surfaces as `SIGN_COUNT_STALE` (HTTP 409).
- **Errors** from Postgres are thrown as-is; the middleware wraps them as `INTERNAL_ERROR` and keeps details off the wire.

## Production notes

- **Rate-limit the challenge endpoint.** It is unauthenticated by design (a challenge must be obtainable before any attestation exists), so an attacker can flood it and bloat the challenges table. The pg_cron sweep bounds the damage, but a per-IP rate limit keeps the write volume down in the first place.
- **Web clients need CORS handling** (OPTIONS preflight + `Access-Control-*` headers) on the challenge endpoint. Native mobile fetch does not send preflights. On hosted Supabase the gateway also expects the anon `apikey` header.
- **Auth-agnostic.** App Attest proves _device integrity_, not user identity. The adapter and middleware compose alongside whatever auth you use — Supabase Auth, AWS Cognito, or any bearer JWT. Verify the assertion and your auth token independently on the same request.

Import path: `@bradford-tech/supabase-integrity-attest/supabase`

For the middleware options the adapter plugs into, see the [withAttestation() reference](/docs/api-with-attestation) and [withAssertion() reference](/docs/api-with-assertion).
