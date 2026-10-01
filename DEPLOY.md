# Sports Pool OS — going live

Everything here is a step only you can do: creating accounts, holding keys, and pressing deploy. The code is done and merged. Budget about twenty minutes.

Work through it in order — later steps need values from earlier ones.

---

## 1. Supabase project

Create a project at [supabase.com/dashboard](https://supabase.com/dashboard). Any region; the free tier is enough for a ten-person pool.

From **Project Settings → API**, copy two values:

| Value | Where it goes |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `service_role` secret | `SUPABASE_SERVICE_ROLE_KEY` |

The `service_role` key bypasses row-level security. It is server-only — it must never reach a browser, and it does not go in any `NEXT_PUBLIC_*` variable. The app never uses the anon key; `.env.example` lists it only for completeness.

## 2. Apply the schema

**SQL Editor → New query**, paste the contents of `supabase/migrations/0001_init.sql`, run it. That creates the ten tables and every unique constraint the idempotency depends on.

Do **not** run `0002_cron.sql` yet — it needs your deployed URL, which you get in step 5.

## 3. Seed your pool

One query. Replace the name if you like; the rest is already your configuration.

```sql
-- The pool. buy_in_cents is 1000 = $10/week.
insert into pools (name, season, buy_in_cents, settings)
values (
  'Sunday Money',
  2026,
  1000,
  jsonb_build_object(
    'autopick_enabled', true,
    'provider', 'espn',
    'timezone', 'America/Chicago',
    'cashtag', '$Lafaze2009'
  )
)
returning id;
```

Then add yourself as commissioner, using the id that came back:

```sql
insert into players (pool_id, name, email, magic_token, is_commissioner)
values (
  '<paste the pool id>',
  'Bill',
  'optimusdigitalsuite@gmail.com',
  -- URL-safe base64: this token goes in a URL path, so the '+', '/' and '='
  -- of standard base64 would break the route. Matches the app's own generator.
  translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_'),
  true
)
returning magic_token;
```

**Save that token.** It is your login — for both your picks and the commissioner console. There is no password to recover; if you lose it, issue yourself a new one with an `update`.

You do not need to create a `weeks` row. The scorekeeper bootstraps week 1 on its first tick and then walks the season on its own.

## 4. Email and Claude

**Resend** ([resend.com](https://resend.com)) — create an API key, and verify a sending domain. Until a domain is verified, mail will not send; the app handles that honestly (it falls back to a no-op channel and reports it) but nobody gets nagged.

- `RESEND_API_KEY` — the key
- `RESEND_FROM` — an address at your verified domain, e.g. `pool@optimusdigitalsuite.com`

**Anthropic** — an API key for the weekly recap. `ANTHROPIC_API_KEY` is read by the SDK itself, not by our code, which is why it does not appear in a grep for `process.env`. Without it the recap degrades to a plain stats summary and everything else runs normally.

**Tick secret** — invent a long random string for `TICK_SECRET`. It guards the agent endpoint against anyone who finds the URL. Any password generator, 32+ characters.

## 5. Deploy

From `products/sports-pool-os`:

```bash
vercel --prod --yes --archive=tgz
```

Two things this repo has bitten on before:

- Vercel refuses the deploy unless the commit email is `optimusdigitalsuite@gmail.com`.
- `--archive=tgz` is required — Windows blocks the prebuilt symlink path.

Set every variable in **Vercel → Settings → Environment Variables** (Production), then redeploy so they take effect:

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM
ANTHROPIC_API_KEY
TICK_SECRET
NEXT_PUBLIC_BASE_URL      ← your deployed URL, e.g. https://sports-pool-os.vercel.app
```

`NEXT_PUBLIC_BASE_URL` is what makes invite links pasteable and lets the console's "Run now" button reach the tick. Without it, both fail with a clear message rather than silently producing something broken.

## 6. Start the clock

Supabase's SQL editor does not run as superuser, so `alter database postgres set ...`
fails with `42501: permission denied to set parameter`. The URL and secret go
directly into the cron job instead.

First enable both extensions from **Database → Extensions** in the dashboard —
`pg_cron` (creates the `cron` schema) and `pg_net` (creates `net`). Creating them
from SQL hits the same permission wall. Skipping this gives you
`3F000: schema "cron" does not exist`.

Then schedule the job, substituting your URL and `TICK_SECRET`:

```sql
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
```

It returns the new job id. Confirm it registered:

```sql
select jobname, schedule, active from cron.job;
```

## 7. Check it works

Open `https://<your-url>/p/<your magic token>`.

Within five minutes of the first tick you should see the current week's games. If the list is empty, the schedule has not synced yet — wait one more tick.

Force a tick instead of waiting:

```bash
curl -X POST https://<your-url>/api/agents/tick \
  -H "Authorization: Bearer <your TICK_SECRET>"
```

The response body is the only observability in the system. It reports what each agent did, what was skipped, and every error. **Read it after the first few ticks** — a misconfigured sender or a missing key shows up there and nowhere else.

Your console is at `https://<your-url>/p/<your magic token>/admin`.

## 8. Add your friends

In the console, type a name and an email. You get a paste-ready invite with their private link. Drop it in the group chat. That is the whole onboarding — no signup, no password, no app store.

---

## Things to know before real money rides on it

- **The magic link is the whole credential.** Anyone holding it is that player. That is the intended trade for zero friction, but it means a link forwarded to the wrong person is that person's access. Reissue by updating `magic_token`.
- **A postponed game holds the week open.** Correctly — it refuses to freeze a week that has not finished — but silently. If a week keeps syncing and never freezes, that is what it looks like.
- **The freeze uses the previous tick's scores**, so it can be up to five minutes stale. A late ESPN stat correction after a freeze will not be picked up; there is no commissioner override for that yet.
- **Standings refresh every 30 seconds** while the tab is visible. The picks screen does not — a game that locks while you sit on that page still looks tappable until you reload. The server rejects it correctly.
- **Nothing alerts.** Errors land in the tick response body and stop there.

## Still open

- **Venmo and Zelle payment options.** Parked until Bill opens accounts with
  both. Venmo takes a deep link that opens a prefilled payment, the same shape
  as the existing Cash App one. Zelle has no universal link — it lives inside
  each bank's own app — so the honest version displays the handle to send to
  rather than pretending to link. **Apple Pay is not possible**: person-to-person
  Apple Cash happens only inside iMessage, and no web page can hand someone
  that. Do not add an Apple Pay button.


- The three background video clips. Royalty-free stock only, rules in `public/backdrop/README.md`. Once chosen, the palette should be re-derived from the actual frames and contrast re-checked against each scrim state.
- A commissioner override for score corrections after a freeze.
- Persisted observability — right now the only record of an agent's decisions is `agent_runs` and the HTTP response nobody is reading.
