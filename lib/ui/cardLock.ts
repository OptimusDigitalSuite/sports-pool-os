import type { EntryRow } from '@/lib/db/types';

/**
 * Whether this deployment can offer the card lock yet.
 *
 * The lock needs `entries.locked_at`, and applying a migration is a manual
 * step separate from deploying. PostgREST simply omits a column that does not
 * exist from `select *`, so the row itself says whether the schema has caught
 * up — and the control appears on its own the moment it has, with no second
 * deploy. Better than shipping a button that throws when tapped.
 */
export function supportsCardLock(entry: EntryRow | null): boolean {
  return entry !== null && 'locked_at' in entry;
}
