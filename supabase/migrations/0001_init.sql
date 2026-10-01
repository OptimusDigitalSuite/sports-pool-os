create extension if not exists "pgcrypto";

create table pools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season int not null,
  buy_in_cents int not null check (buy_in_cents > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  magic_token text not null unique,
  is_commissioner boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index players_pool_idx on players(pool_id);

-- Games are global, not pool-scoped: one sync serves every pool.
create table games (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  season int not null,
  week int not null,
  home_team text not null,
  away_team text not null,
  home_abbr text not null,
  away_abbr text not null,
  kickoff_at timestamptz not null,
  home_score int,
  away_score int,
  status text not null check (status in ('scheduled', 'in_progress', 'final')),
  updated_at timestamptz not null default now()
);
create index games_season_week_idx on games(season, week);

create table weeks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references pools(id) on delete cascade,
  season int not null,
  week_number int not null,
  tiebreak_game_id uuid references games(id),
  status text not null default 'open' check (status in ('open', 'live', 'frozen')),
  frozen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pool_id, season, week_number)
);

create table picks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  week_id uuid not null references weeks(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  picked_abbr text not null,
  is_auto boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, game_id)
);
create index picks_week_idx on picks(week_id);

create table tiebreaker_guesses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  week_id uuid not null references weeks(id) on delete cascade,
  predicted_total int not null check (predicted_total >= 0),
  updated_at timestamptz not null default now(),
  unique (player_id, week_id)
);

-- The ledger. No fee column exists, by design.
create table entries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  week_id uuid not null references weeks(id) on delete cascade,
  buy_in_cents int not null check (buy_in_cents > 0),
  paid_at timestamptz,
  method text,
  confirmed_by uuid references players(id),
  created_at timestamptz not null default now(),
  unique (player_id, week_id)
);

create table week_results (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references weeks(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  correct int not null,
  incorrect int not null,
  voided int not null,
  tiebreak_delta int,
  rank int not null,
  payout_cents int not null default 0,
  unique (week_id, player_id)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid references pools(id) on delete cascade,
  agent text not null,
  run_key text not null unique,
  actions jsonb not null default '[]'::jsonb,
  outcome text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  channel text not null,
  template text not null,
  dedupe_key text not null unique,
  sent_at timestamptz not null default now()
);
