-- Runs the agent tick every five minutes without needing a paid scheduler.
--
-- Enable pg_cron and pg_net from the Supabase dashboard (Database → Extensions)
-- before running this. Supabase's SQL editor is not superuser, so
-- `create extension` and `alter database ... set` both fail there with 42501.
--
-- Substitute the URL and secret below. An earlier version of this file read them
-- via current_setting('app.tick_url'), which cannot be set on Supabase.
--
-- timeout_milliseconds here (60000) and route.ts's `maxDuration = 60` are
-- deliberately matched: a freeze-and-recap tick makes one Claude call plus a
-- send per player and will not finish in pg_net's 5s default, so the cron
-- must allow at least as long as the route is allowed to run.
select cron.schedule(
  'sports-pool-os-agent-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<your-url>/api/agents/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <your TICK_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
