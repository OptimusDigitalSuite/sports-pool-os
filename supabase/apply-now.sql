-- Sports Pool OS: everything the live database is missing, as one paste.
-- Safe to run twice: each statement checks first.

-- 0003: one deadline per week, plus the commissioner's override on top of it.
alter table weeks
  add column if not exists lock_override text
  check (lock_override in ('locked', 'open'));

-- 0004: re-pasting a roster is a no-op, not a second copy of everyone.
create unique index if not exists players_pool_email_idx
  on players (pool_id, lower(email)) where email is not null;

-- 0005: a game can sit in the week without counting toward it.
create table if not exists week_exclusions (
  week_id uuid not null references weeks(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (week_id, game_id)
);
