import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/lib/db/client', () => ({ createServiceClient: () => ({}) }));

beforeEach(() => {
  // VideoBackdrop reads prefers-reduced-motion; jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

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

function game(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'g1',
    external_id: 'e1',
    season: 2026,
    week: 3,
    home_team: 'Minnesota Vikings',
    away_team: 'Green Bay Packers',
    home_abbr: 'MIN',
    away_abbr: 'GB',
    kickoff_at: '2026-09-20T17:00:00.000Z',
    home_score: null,
    away_score: null,
    status: 'scheduled' as const,
    updated_at: '',
    ...overrides,
  };
}

vi.mock('@/lib/db/repositories', () => ({
  createRepositories: () => ({
    players: { getByToken: async () => player },
    pools: { get: async () => pool },
    weeks: { latestForPool: async () => week },
  }),
}));

let stateGames: ReturnType<typeof game>[] = [];

vi.mock('@/lib/ui/loadPlayerWeek', () => ({
  loadPlayerWeek: async () => ({
    player: { id: player.id, name: player.name, isCommissioner: false },
    pool,
    week,
    games: stateGames,
    picks: [],
    guess: null,
    entry: null,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PicksPage kickoff lock', () => {
  it('locks a game whose kickoff time is unparseable, mirroring the engine failing closed', async () => {
    stateGames = [game({ kickoff_at: 'not-a-real-date' })];
    const { default: PicksPage } = await import('@/app/p/[token]/page');
    const element = await PicksPage({ params: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByText(/Green Bay Packers/i).closest('[data-state]')).toHaveAttribute(
      'data-state',
      'locked',
    );
  });

  it('leaves a game with a valid future kickoff unlocked', async () => {
    stateGames = [game({ kickoff_at: '2099-01-01T00:00:00.000Z' })];
    const { default: PicksPage } = await import('@/app/p/[token]/page');
    const element = await PicksPage({ params: Promise.resolve({ token: 'tok' }) });
    render(element);
    expect(screen.getByRole('button', { name: /Green Bay Packers/i })).toBeInTheDocument();
  });
});
