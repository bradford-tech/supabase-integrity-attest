-- Canonical App Attest schema for @bradford-tech/supabase-integrity-attest.
-- Copy into your Supabase project's migrations. Pairs with
-- createSupabaseAdapter() from the /supabase subpath.

create table app_attest_devices (
  device_id      text primary key,
  public_key_pem text not null,
  sign_count     bigint not null default 0 check (sign_count >= 0),
  receipt        bytea,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

comment on table app_attest_devices is
  'Verified App Attest device keys. device_id is the Apple-issued keyId.';

-- RLS with no policies = service-role-only access. The anon key MUST NOT
-- write here: the security model depends on public_key_pem being populated
-- exclusively through the verified attestation flow.
alter table app_attest_devices enable row level security;

create table app_attest_challenges (
  challenge   bytea primary key,
  purpose     text not null check (purpose in ('attestation', 'assertion')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

comment on table app_attest_challenges is
  'Short-lived single-use challenge nonces. Consumed via DELETE ... RETURNING.';

alter table app_attest_challenges enable row level security;

create index app_attest_challenges_expires_at_idx
  on app_attest_challenges (expires_at);

-- Sweep issued-but-never-used challenges (consumption only deletes used
-- ones). Without this the table grows without bound.
create extension if not exists pg_cron;

select cron.schedule(
  'app-attest-challenge-sweep',
  '*/10 * * * *',
  $$delete from app_attest_challenges where expires_at < now()$$
);
