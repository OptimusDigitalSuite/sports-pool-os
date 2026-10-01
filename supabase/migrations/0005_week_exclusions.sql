-- A game that is in the week but does not count.
--
-- Week 1 2026 opens with a Wednesday night game and a Friday morning game in
-- Melbourne, days before the Sunday slate everyone actually plays. Under a
-- single week deadline those two games would close the entire week on
-- Wednesday night, so a pool that assembles on Saturday could not enter at
-- all. Excluding them moves the deadline to the first game that remains.
--
-- Deliberately per week rather than per game: the same fixture counts for a
-- pool that was ready for it and not for one that was not.
create table week_exclusions (
  week_id uuid not null references weeks(id) on delete cascade,
  game_id uuid not null references games(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (week_id, game_id)
);
