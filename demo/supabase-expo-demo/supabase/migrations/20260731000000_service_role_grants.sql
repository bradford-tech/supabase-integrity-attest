-- Explicit DML grants for the service role.
--
-- Newer Supabase stacks no longer include DML in the default privileges
-- for tables created by migrations (anon/authenticated/service_role get
-- only truncate/references/trigger/maintain). RLS-with-no-policies still
-- blocks anon and authenticated, but the service role now needs explicit
-- grants or every edge-function query fails with "permission denied".

grant select, insert, update, delete on app_attest_devices to service_role;
grant select, insert, update, delete on app_attest_challenges to service_role;

-- Demo-only: the A/B event table plus the sequence behind its bigserial id.
grant select, insert, update, delete on demo_events to service_role;
grant usage on sequence demo_events_id_seq to service_role;
