-- Sweep expired challenges.
-- Consumed challenges are deleted atomically on use, but challenges that
-- are issued and never used (abandoned flows, floods of the unauthenticated
-- challenge endpoint) would accumulate forever. pg_cron deletes anything
-- past its expires_at every 10 minutes, using the existing expires_at index.
create extension if not exists pg_cron;

select cron.schedule(
  'app-attest-challenge-sweep',
  '*/10 * * * *',
  $$delete from app_attest_challenges where expires_at < now()$$
);
