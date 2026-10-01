import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const notFoundSentinel = new Error('NEXT_NOT_FOUND');
const notFound = vi.fn(() => {
  throw notFoundSentinel;
});

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/lib/db/client', () => ({ createServiceClient: () => ({}) }));

const player = {
  id: 'p1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'tok',
  is_commissioner: false,
  is_active: true,
  created_at: '',
};
const pool = {
  id: 'pool1',
  name: 'Sunday Money',
  season: 2026,
  buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn' as const, timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};
const week = {
  id: 'w1',
  pool_id: 'pool1',
  season: 2026,
  week_number: 3,
  tiebreak_game_id: null,
  lock_override: null,
  status: 'open' as const,
  frozen_at: null,
  created_at: '',
};

let viewer: typeof player = player;
const poolsGet = vi.fn(async (_poolId: string) => pool);

vi.mock('@/lib/db/repositories', () => ({
  createRepositories: () => ({
    players: {
      getByToken: async () => viewer,
      listActive: async () => [player],
    },
    pools: { get: (poolId: string) => poolsGet(poolId) },
    weeks: { latestForPool: async () => week, listForSeason: async () => [week] },
    games: { listByWeek: async () => [] },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    picks: { listByWeek: async () => [] },
    guesses: { listByWeek: async () => [] },
    entries: { listByWeek: async () => [], listForWeeks: async () => [] },
    // Season table read path — empty here; buildSeasonStandings has its own
    // tests for the aggregation itself.
    weekResults: { listForWeeks: async () => [] },
  }),
}));

beforeEach(() => {
  viewer = player;
  notFound.mockClear();
  poolsGet.mockClear();
});

afterEach(() => {
  vi.resetModules();
});

describe('StandingsPage deactivated player', () => {
  it('404s a deactivated player instead of showing them standings', async () => {
    viewer = { ...player, is_active: false };
    const { default: StandingsPage } = await import('@/app/p/[token]/standings/page');

    await expect(
      StandingsPage({ params: Promise.resolve({ token: 'tok' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalled();
    // The is_active check must happen before any further data is loaded for
    // a deactivated player — matching loadPlayerWeek's own gate.
    expect(poolsGet).not.toHaveBeenCalled();
  });

  it('still shows standings for an active player', async () => {
    viewer = player;
    const { default: StandingsPage } = await import('@/app/p/[token]/standings/page');

    await expect(
      StandingsPage({ params: Promise.resolve({ token: 'tok' }) }),
    ).resolves.toBeDefined();
    expect(notFound).not.toHaveBeenCalled();
  });
});
