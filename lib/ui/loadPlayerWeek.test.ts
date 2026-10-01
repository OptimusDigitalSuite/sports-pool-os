import { describe, it, expect } from 'vitest';
import { loadPlayerWeek } from '@/lib/ui/loadPlayerWeek';
import type { Repositories } from '@/lib/db/repositories';

const player = {
  id: 'p1', pool_id: 'pool1', name: 'Bill', email: null, phone: null,
  magic_token: 'tok', is_commissioner: false, is_active: true, created_at: '',
};
const pool = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn' as const, timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};
const week = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g1', status: 'open' as const, frozen_at: null, created_at: '',
  lock_override: null,
};

function repos(over: Record<string, unknown> = {}) {
  return {
    players: { getByToken: async () => player, listActive: async () => [player], getById: async () => player },
    pools: { get: async () => pool },
    weeks: { find: async () => week, getById: async () => week, upsert: async () => week, setStatus: async () => {} },
    games: { listByWeek: async () => [], getById: async () => null, upsertMany: async () => {} },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    picks: { listByWeek: async () => [], upsert: async () => {} },
    guesses: { listByWeek: async () => [], upsert: async () => {} },
    entries: { listByWeek: async () => [], ensure: async () => {}, markPaid: async () => {} },
    ...over,
  } as unknown as Repositories;
}

describe('loadPlayerWeek', () => {
  it('returns null for an unknown token rather than throwing', async () => {
    const r = repos({ players: { getByToken: async () => null } });
    expect(await loadPlayerWeek(r, 'nope', 3)).toBeNull();
  });

  it('returns null for a deactivated player', async () => {
    const r = repos({ players: { getByToken: async () => ({ ...player, is_active: false }) } });
    expect(await loadPlayerWeek(r, 'tok', 3)).toBeNull();
  });

  it('returns only this player\'s picks, never anyone else\'s', async () => {
    const r = repos({
      picks: {
        listByWeek: async () => [
          { id: 'a', player_id: 'p1', week_id: 'w1', game_id: 'g1', picked_abbr: 'MIN', is_auto: false, created_at: '', updated_at: '' },
          { id: 'b', player_id: 'p2', week_id: 'w1', game_id: 'g1', picked_abbr: 'GB', is_auto: false, created_at: '', updated_at: '' },
        ],
        upsert: async () => {},
      },
    });
    const result = await loadPlayerWeek(r, 'tok', 3);
    expect(result?.picks).toHaveLength(1);
    expect(result?.picks[0]!.player_id).toBe('p1');
  });

  it('never returns the magic token in its payload', async () => {
    const result = await loadPlayerWeek(repos(), 'tok', 3);
    expect(JSON.stringify(result)).not.toContain('tok');
  });
});
