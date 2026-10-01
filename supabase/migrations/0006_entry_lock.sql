-- A player locking their own card.
--
-- The week's deadline stops everybody at once. This is the opposite problem:
-- a finished card that must not change because a phone was in a pocket.
-- Self-service and reversible — an accidental lock has to be undoable, or it
-- is worse than the taps it prevents.
--
-- On the entry rather than the player, because it is per week: locking Week 1
-- must not silence Week 2. Null means unlocked, which is every existing row.
alter table entries add column if not exists locked_at timestamptz;
