-- Core App Attest schema.
-- Copy this migration into your own Supabase project to adopt the
-- @bradford-tech/supabase-integrity-attest library.

create table app_attest_devices (
  device_id      text primary key,
  public_key_pem text not null,
  sign_count     bigint not null default 0 check (sign_count >= 0),
  receipt        bytea,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz
);

comment on table app_attest_devices is
  'Verified App Attest device keys. device_id is the Apple-issued keyId from generateKeyAsync().';

create table app_attest_challenges (
  challenge   bytea primary key,
  purpose     text not null check (purpose in ('attestation', 'assertion')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

comment on table app_attest_challenges is
  'Short-lived single-use challenge nonces. Consume via DELETE ... RETURNING.';

create index app_attest_challenges_expires_at_idx
  on app_attest_challenges (expires_at);
