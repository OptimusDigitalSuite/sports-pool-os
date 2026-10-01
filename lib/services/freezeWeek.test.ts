import { describe, it, expect } from 'vitest';
import { freezeWeek, WeekFrozenError, WeekPoolMismatchError } from '@/lib/services/freezeWeek';
import type { Repositories } from '@/lib/db/repositories';
import type { EntryRow, GameRow, PickRow, PlayerRow, PoolRow, WeekRow } from '@/lib/db/types';

const poolRow: PoolRow = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn', timezone: 'America/Chicago', cashtag: '$Lafaze2009' },
  created_at: '',
};

const weekRow: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g2', status: 'live', frozen_at: null, created_at: '',
  lock_override: null,
};

const game = (id: string, home: number, away: number): GameRow => ({
  id, external_id: `e${id}`, season: 2026, week: 3,
  home_team: 'Home', away_team: 'Away', home_abbr: `H${id}`, away_abbr: `A${id}`,
  kickoff_at: '2026-09-20T17:00:00.000Z',
  home_score: home, away_score: away, status: 'final', updated_at: '',
});

const player = (id: string, name: string): PlayerRow => ({
  id, pool_id: 'pool1', name, email: `${id}@x.test`, phone: null,
  magic_token: `tok-${id}`, is_commissioner: false, is_active: true, created_at: '',
});

const pick = (playerId: string, gameId: string, abbr: string): PickRow => ({
  id: `pk-${playerId}-${gameId}`, player_id: playerId, week_id: 'w1', game_id: gameId,
  picked_abbr: abbr, is_auto: false, created_at: '', updated_at: '',
});

const entry = (playerId: string): EntryRow => ({
  id: `en-${playerId}`, player_id: playerId, week_id: 'w1', buy_in_cents: 1000,
  paid_at: null, method: null, confirmed_by: null, locked_at: null, created_at: '',
});

function stubRepos(over: { week?: WeekRow } = {}) {
  const written: { results?: unknown[]; status?: string } = {};
  const repos = {
    pools: { get: async () => poolRow },
    players: { listActive: async () => [player('p1', 'Bill'), player('p2', 'Kenneth')], getByToken: async () => null, getById: async () => null },
    games: { listByWeek: async () => [game('g1', 24, 20), game('g2', 27, 24)], getById: async () => null, upsertMany: async () => {} },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    weeks: {
      find: async () => over.week ?? weekRow,
      getById: async () => over.week ?? weekRow,
      upsert: async () => weekRow,
      setStatus: async (_id: string, status: string) => { written.status = status; },
    },
    picks: { listByWeek: async () => [pick('p1', 'g1', 'Hg1'), pick('p2', 'g1', 'Ag1')], upsert: async () => {} },
    guesses: { listByWeek: async () => [{ id: 'tg1', player_id: 'p1', week_id: 'w1', predicted_total: 51, updated_at: '' }], upsert: async () => {} },
    entries: { listByWeek: async () => [entry('p1'), entry('p2')], ensure: async () => {}, markPaid: async () => {} },
    agentRuns: { claim: async () => true },
    notifications: { claim: async () => true },
    weekResults: { replaceForWeek: async (_weekId: string, rows: unknown[]) => { written.results = rows; } },
  } as unknown as Repositories;
  return { repos, written };
}

describe('freezeWeek', () => {
  it('writes one result row per player with rank and payout', async () => {
    const { repos, written } = stubRepos();
    await freezeWeek({ repos }, 'pool1', 'w1');
    expect(written.results).toHaveLength(2);
    const bill = (written.results as Array<{ player_id: string; rank: number; payout_cents: number; correct: number }>).find((r) => r.player_id === 'p1')!;
    expect(bill.correct).toBe(1);
    expect(bill.rank).toBe(1);
    expect(bill.payout_cents).toBe(2000);
  });

  it('pays out exactly the pot', async () => {
    const { repos, written } = stubRepos();
    await freezeWeek({ repos }, 'pool1', 'w1');
    const total = (written.results as Array<{ payout_cents: number }>).reduce((sum, r) => sum + r.payout_cents, 0);
    expect(total).toBe(2000);
  });

  it('marks the week frozen', async () => {
    const { repos, written } = stubRepos();
    await freezeWeek({ repos }, 'pool1', 'w1');
    expect(written.status).toBe('frozen');
  });

  it('refuses to freeze a week that is already frozen', async () => {
    const { repos, written } = stubRepos({ week: { ...weekRow, status: 'frozen' } });
    await expect(freezeWeek({ repos }, 'pool1', 'w1')).rejects.toThrow(WeekFrozenError);
    expect(written.results).toBeUndefined();
    expect(written.status).toBeUndefined();
  });

  it('refuses to freeze a week belonging to a different pool, and writes nothing', async () => {
    const { repos, written } = stubRepos({ week: { ...weekRow, pool_id: 'someone-elses-pool' } });
    await expect(freezeWeek({ repos }, 'pool1', 'w1')).rejects.toThrow(WeekPoolMismatchError);
    expect(written.results).toBeUndefined();
    expect(written.status).toBeUndefined();
  });
});
