import { describe, it, expect, vi } from 'vitest';
import { loadTickState, makeGenerateRecapFor, runAllPools, type SupabaseClientLike } from '@/lib/agents/wire';
import { createNoopChannel } from '@/lib/notify/noop';
import { plainSummary } from '@/lib/recap/summary';
import type { Repositories } from '@/lib/db/repositories';
import type { PoolRow, WeekRow } from '@/lib/db/types';

vi.mock('@/lib/services/syncSchedule', () => ({
  syncWeek: vi.fn().mockResolvedValue({ week: {}, games: [] }),
}));

/**
 * Records every call so tests can assert the query shape without a live
 * database. Mirrors the pattern in lib/db/repositories.test.ts: every chain
 * method returns the same object, and that object is a thenable, so
 * `await client.from(t).select().eq().eq().order().limit()` resolves like
 * the real PostgREST builder does.
 */
function stubClient(rowsByTable: Record<string, unknown[]> = {}) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, op: method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return chain;
  }

  const client: SupabaseClientLike = { from: (table: string) => makeChain(table) as never };
  return { client, calls };
}

/** Only the repo methods loadTickState/runTick actually call are implemented. */
function stubRepos(over: {
  pools?: { get: ReturnType<typeof vi.fn> };
  agentRuns?: { claim: ReturnType<typeof vi.fn> };
  weeks?: { latestForPool: ReturnType<typeof vi.fn> };
}): Repositories {
  return {
    pools: over.pools ?? { get: vi.fn().mockResolvedValue(null) },
    players: { listActive: vi.fn().mockResolvedValue([]), getByToken: vi.fn(), getById: vi.fn() },
    games: { listByWeek: vi.fn().mockResolvedValue([]), getById: vi.fn(), upsertMany: vi.fn() },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    weeks: {
      find: vi.fn(),
      getById: vi.fn(),
      latestForPool: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      setStatus: vi.fn(),
      ...over.weeks,
    },
    picks: { listByWeek: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    guesses: { listByWeek: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    entries: { listByWeek: vi.fn().mockResolvedValue([]), ensure: vi.fn(), markPaid: vi.fn() },
    agentRuns: over.agentRuns ?? { claim: vi.fn().mockResolvedValue(true) },
    notifications: { claim: vi.fn().mockResolvedValue(true), release: vi.fn() },
  } as unknown as Repositories;
}

function pool(over: Partial<PoolRow> = {}): PoolRow {
  return {
    id: 'pool1',
    name: 'Sunday Money',
    season: 2026,
    buy_in_cents: 1000,
    settings: { autopick_enabled: false, provider: 'espn', timezone: 'America/Chicago', cashtag: null },
    created_at: '',
    ...over,
  };
}

function week(over: Partial<WeekRow> = {}): WeekRow {
  return {
    id: 'w1',
    pool_id: 'pool1',
    season: 2026,
    week_number: 3,
    tiebreak_game_id: null,
    lock_override: null,
    status: 'live',
    frozen_at: null,
    created_at: '',
    ...over,
  };
}

describe('loadTickState', () => {
  // The season filter itself — that the underlying query is scoped to both
  // pool_id and season, not just pool_id — is guarded where the query now
  // lives: repos.weeks.latestForPool's own test in
  // lib/db/repositories.test.ts asserts on the raw eq() calls. This test only
  // asserts loadTickState wires the pool's season through to that repository
  // call rather than, say, a hardcoded or stale value.
  it('asks the repository for the current week, scoped to the pool and its own season', async () => {
    const thePool = pool({ season: 2026 });
    const latestForPool = vi.fn().mockResolvedValue(week({ season: 2026 }));
    const { client } = stubClient();
    const repos = stubRepos({ pools: { get: vi.fn().mockResolvedValue(thePool) }, weeks: { latestForPool } });

    await loadTickState(client, repos, 'pool1', new Date('2026-09-20T16:00:00.000Z'));

    expect(latestForPool).toHaveBeenCalledWith('pool1', 2026);
  });

  it('yields a synthetic, unsaved week 1 when the pool has no weeks, rather than going dead', async () => {
    // Nothing else ever creates the first weeks row — syncWeek does, but only
    // in response to a sync_week action, and the scorekeeper only emits that
    // for a week it can already see. Returning null here left a fresh pool
    // permanently inert, so this must hand back something the scorekeeper can
    // act on instead.
    const { client } = stubClient();
    const repos = stubRepos({
      pools: { get: vi.fn().mockResolvedValue(pool({ season: 2026 })) },
      weeks: { latestForPool: vi.fn().mockResolvedValue(null) },
    });

    const state = await loadTickState(client, repos, 'pool1', new Date('2026-09-20T16:00:00.000Z'));

    expect(state).not.toBeNull();
    expect(state?.week).toEqual({
      id: '',
      pool_id: 'pool1',
      season: 2026,
      week_number: 1,
      tiebreak_game_id: null,
      lock_override: null,
      status: 'open',
      frozen_at: null,
      created_at: '',
    });
    expect(state?.games).toEqual([]);
    expect(state?.picks).toEqual([]);
    expect(state?.guesses).toEqual([]);
    expect(state?.entries).toEqual([]);
    expect(state?.results).toEqual([]);
  });
});

describe('makeGenerateRecapFor', () => {
  it('reports onDegraded and falls back to the plain summary when there is no anthropic client', async () => {
    // ANTHROPIC_API_KEY missing is the single most common reason a deployment
    // silently serves plain summaries. Dropping onDegraded here — as the
    // fallback branch used to — produced no signal at all.
    const onDegraded = vi.fn();
    const input = { weekNumber: 3, potCents: 1000, rows: [] };

    const text = await makeGenerateRecapFor(null)(input, onDegraded);

    expect(onDegraded).toHaveBeenCalledWith('no anthropic client configured');
    expect(text).toBe(plainSummary(input));
  });
});

describe('runAllPools', () => {
  it('isolates a failing pool: the rest still get reports, and the failure is recorded', async () => {
    const claim = vi.fn((poolId: string) =>
      poolId === 'pool1' ? Promise.reject(new Error('boom')) : Promise.resolve(true),
    );
    const repos = stubRepos({ agentRuns: { claim }, pools: { get: vi.fn().mockResolvedValue(null) } });
    const { client } = stubClient();

    const reports = await runAllPools(
      {
        client,
        repos,
        channel: createNoopChannel(),
        now: () => new Date('2026-09-20T16:00:00.000Z'),
        generateRecapFor: vi.fn(),
      },
      ['pool1', 'pool2'],
    );

    expect(reports.pool1?.claimed).toBe(false);
    expect(reports.pool1?.execution?.failed).toBe(1);
    expect(reports.pool1?.execution?.errors).toEqual(['boom']);
    // pool2's claim succeeds, then loadState finds no pool and bails cleanly —
    // it never sees pool1's failure.
    expect(reports.pool2).toEqual({ claimed: true, actions: 0, execution: null });
  });

  // Provider selection only happens lazily, inside the executor closure, when
  // a tick actually has an action to run — so the state here is built to
  // produce exactly one action (scorekeeper's sync_week, from an empty,
  // unfrozen week) and nothing from the other three agents. `syncSchedule` is
  // mocked above, so this asserts on the provider it was called with rather
  // than on network activity: that is the honest read of the code as
  // written, since provider selection lives in wire.ts and syncWeek is the
  // only place the chosen provider is passed onward.
  it('selects the manual provider for a manual pool and the ESPN provider otherwise', async () => {
    const { syncWeek } = await import('@/lib/services/syncSchedule');
    const syncWeekMock = syncWeek as unknown as ReturnType<typeof vi.fn>;
    syncWeekMock.mockClear();

    const manualPool = pool({ id: 'manual-pool', settings: { ...pool().settings, provider: 'manual' } });
    const espnPool = pool({ id: 'espn-pool', settings: { ...pool().settings, provider: 'espn' } });

    const pools: Record<string, PoolRow> = { 'manual-pool': manualPool, 'espn-pool': espnPool };
    const repos = stubRepos({
      pools: { get: vi.fn((id: string) => Promise.resolve(pools[id] ?? null)) },
      weeks: { latestForPool: vi.fn().mockResolvedValue(week({ status: 'live' })) },
    });
    const { client } = stubClient();

    await runAllPools(
      {
        client,
        repos,
        channel: createNoopChannel(),
        now: () => new Date('2026-09-20T16:00:00.000Z'),
        generateRecapFor: vi.fn(),
      },
      ['manual-pool', 'espn-pool'],
    );

    expect(syncWeekMock).toHaveBeenCalledTimes(2);
    // Keyed by the poolId syncWeek was called with (its second argument), not
    // just "both provider names appeared somewhere" — that weaker assertion
    // would still pass if the two pools' providers were swapped.
    const providerByPoolId = new Map(
      syncWeekMock.mock.calls.map((call: unknown[]) => [
        call[1] as string,
        (call[0] as { provider: { name: string } }).provider.name,
      ]),
    );
    expect(providerByPoolId.get('manual-pool')).toBe('manual');
    expect(providerByPoolId.get('espn-pool')).toBe('espn');
  });
});
