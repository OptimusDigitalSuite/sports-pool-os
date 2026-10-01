-- One deadline per week instead of one per game.
--
-- Picks used to lock individually at each game's own kickoff, so a Sunday
-- game was still pickable on Sunday morning. The pool wants every entry in
-- before the week's first kickoff — Thursday night most weeks, though week 1
-- of 2026 opens on a Wednesday, which is why the rule is "first kickoff of
-- the week" and never a weekday.
--
-- lock_override is the commissioner's hand on top of that rule:
--   null       follow the automatic deadline
--   'locked'   closed now, whatever the clock says
--   'open'     reopened, even after the deadline has passed
--
-- Nullable with no default, so every existing week keeps the automatic rule.
alter table weeks
  add column lock_override text
  check (lock_override in ('locked', 'open'));
