import { describe, it, expect } from 'vitest';
import { supportsCardLock } from '@/lib/ui/cardLock';
import type { EntryRow } from '@/lib/db/types';

describe('supportsCardLock', () => {
  it('is false before the column exists, because PostgREST omits it from select *', () => {
    // Exactly the row shape the API returns while migration 0006 is unapplied.
    const legacy = { id: 'e1', player_id: 'p1', week_id: 'w1' } as unknown as EntryRow;
    expect(supportsCardLock(legacy)).toBe(false);
  });

  it('is true once the column is there, even while unlocked', () => {
    const row = { id: 'e1', player_id: 'p1', week_id: 'w1', locked_at: null } as unknown as EntryRow;
    expect(supportsCardLock(row)).toBe(true);
  });

  it('is false for a player who has not entered yet', () => {
    expect(supportsCardLock(null)).toBe(false);
  });
});
