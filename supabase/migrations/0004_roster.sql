-- Re-pasting a roster must be a no-op, not a second copy of everyone.
--
-- Without this, a duplicate player also means a duplicate `entries` row, and
-- a pot that no longer matches what was actually collected. Partial, because
-- `email` is nullable and several real players have no address: two name-only
-- rows stay indistinguishable and are both allowed through.
create unique index players_pool_email_idx
  on players (pool_id, lower(email)) where email is not null;
