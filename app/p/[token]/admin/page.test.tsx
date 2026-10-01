import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const notFoundSentinel = new Error('NEXT_NOT_FOUND');
const notFound = vi.fn(() => {
  throw notFoundSentinel;
});

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
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

const commissioner = {
  id: 'p1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'commish-tok',
  is_commissioner: true,
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

let viewer: typeof commissioner | null = commissioner;
const poolsGet = vi.fn(async (_poolId: string) => pool);

vi.mock('@/lib/db/repositories', () => ({
  createRepositories: () => ({
    players: {
      getByToken: async () => viewer,
      listActive: async () => (viewer ? [viewer] : []),
    },
    pools: { get: (poolId: string) => poolsGet(poolId) },
    weeks: { latestForPool: async () => week },
    // The console derives the week's deadline the same way the picks page
    // does, so it reads the schedule too.
    games: { listByWeek: async () => [] },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    entries: { listByWeek: async () => [] },
    picks: { listByWeek: async () => [] },
  }),
}));

beforeEach(() => {
  viewer = commissioner;
  notFound.mockClear();
  poolsGet.mockClear();
});

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.clearAllMocks();
});

describe('AdminPage gating', () => {
  it('404s an unknown token', async () => {
    viewer = null;
    const { default: AdminPage } = await import('@/app/p/[token]/admin/page');

    await expect(AdminPage({ params: Promise.resolve({ token: 'nope' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFound).toHaveBeenCalled();
    expect(poolsGet).not.toHaveBeenCalled();
  });

  it('404s a deactivated commissioner', async () => {
    viewer = { ...commissioner, is_active: false };
    const { default: AdminPage } = await import('@/app/p/[token]/admin/page');

    await expect(
      AdminPage({ params: Promise.resolve({ token: 'commish-tok' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(poolsGet).not.toHaveBeenCalled();
  });

  it('404s a valid player who is not the commissioner — same treatment as an invalid link, not a permission error', async () => {
    viewer = { ...commissioner, is_commissioner: false };
    const { default: AdminPage } = await import('@/app/p/[token]/admin/page');

    await expect(
      AdminPage({ params: Promise.resolve({ token: 'player-tok' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
    expect(poolsGet).not.toHaveBeenCalled();
  });

  it('renders the console for a valid commissioner', async () => {
    viewer = commissioner;
    const { default: AdminPage } = await import('@/app/p/[token]/admin/page');

    const element = await AdminPage({ params: Promise.resolve({ token: 'commish-tok' }) });
    render(element);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByText('Sunday Money')).toBeInTheDocument();
    expect(screen.getByText('Add a player')).toBeInTheDocument();
  });

  it('scopes the console to the commissioner’s own pool, not the first pool in the table', async () => {
    viewer = commissioner;
    const { default: AdminPage } = await import('@/app/p/[token]/admin/page');

    await AdminPage({ params: Promise.resolve({ token: 'commish-tok' }) });

    expect(poolsGet).toHaveBeenCalledWith('pool1');
  });
});
