-- Demo-only migration.
-- DO NOT COPY INTO A REAL PROJECT — this table exists solely for the
-- unprotected-event / protected-event A/B demo to show identical
-- business work on both sides.

create table demo_events (
  id          bigserial primary key,
  device_id   text references app_attest_devices(device_id) on delete set null,
  protected   boolean not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

comment on table demo_events is
  'Demo-only. Records identical inserts from unprotected-event and protected-event so the A/B timing comparison is fair.';

-- RLS with no policies = service-role-only access.
alter table demo_events enable row level security;

create index demo_events_created_at_idx on demo_events (created_at desc);
