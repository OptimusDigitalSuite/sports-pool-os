import { describe, it, expect } from 'vitest';
import { createRepositories } from '@/lib/db/repositories';

/**
 * Records every call so we can assert the query shape without a live database.
 * Every chain method returns the same object, and that object is a thenable,
 * so `await client.from(t).select().eq().order()` resolves like the real
 * PostgREST builder does.
 */
function stubClient(
  rows: unknown[] = [],
  error: { code?: string; message: string } | null = null,
) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'is', 'neq', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, op: method, payload: args });
        return chain;
      };
    }
    for (const op of ['upsert', 'update', 'insert']) {
      chain[op] = (payload: unknown, opts?: unknown) => {
        calls.push({ table, op, payload: [payload, opts] });
        return chain;
      };
    }
    chain.delete = (...args: unknown[]) => {
      calls.push({ table, op: 'delete', payload: args });
      return chain;
    };
    chain.maybeSingle = async () => ({ data: rows[0] ?? null, error });
    chain.then = (resolve: (value: { data: unknown[]; error: typeof error }) => void) =>
      resolve({ data: rows, error });
    return chain;
  }

  const client = { from: (table: string) => makeChain(table) };
  return { client: client as never, calls };
}

describe('createRepositories', () => {
  it('reads games for a season and week', async () => {
    const { client, calls } = stubClient([{ id: 'g1' }]);
    const repos = createRepositories(client);
    const games = await repos.games.listByWeek(2026, 3);
    expect(games).toEqual([{ id: 'g1' }]);
    expect(calls[0]!.table).toBe('games');
  });

  it('upserts games keyed on external_id so a re-sync updates rather than duplicates', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.games.upsertMany([
      {
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
        status: 'scheduled',
      },
    ]);
    const call = calls.find((c) => c.op === 'upsert')!;
    expect(call.table).toBe('games');
    const [, opts] = call.payload as [unknown, { onConflict?: string } | undefined];
    expect(opts?.onConflict).toBe('external_id');
  });

  it('upserts a pick keyed on the player and game pair', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.picks.upsert({
      player_id: 'p1',
      week_id: 'w1',
      game_id: 'g1',
      picked_abbr: 'MIN',
      is_auto: false,
    });
    const call = calls.find((c) => c.op === 'upsert')!;
    expect(call.table).toBe('picks');
    expect(JSON.stringify(call.payload)).toContain('player_id,game_id');
  });

  it('creates an entry only if one does not already exist', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.entries.ensure('p1', 'w1', 1000);
    const call = calls.find((c) => c.op === 'upsert')!;
    expect(call.table).toBe('entries');
    const [, opts] = call.payload as [unknown, { onConflict?: string; ignoreDuplicates?: boolean } | undefined];
    expect(opts?.onConflict).toBe('player_id,week_id');
    expect(opts?.ignoreDuplicates).toBe(true);
  });

  it('fetches a week directly by its id', async () => {
    const { client, calls } = stubClient([{ id: 'w1', week_number: 3 }]);
    const repos = createRepositories(client);
    const week = await repos.weeks.getById('w1');
    expect(week).toEqual({ id: 'w1', week_number: 3 });
    expect(calls.some((c) => c.table === 'weeks')).toBe(true);
  });

  it('finds the pool\'s current week by filtering on both pool_id and season, ordered descending', async () => {
    const { client, calls } = stubClient([{ id: 'w2', week_number: 5 }]);
    const repos = createRepositories(client);
    const week = await repos.weeks.latestForPool('pool1', 2026);
    expect(week).toEqual({ id: 'w2', week_number: 5 });
    const weekEqCalls = calls.filter((c) => c.table === 'weeks' && c.op === 'eq');
    expect(weekEqCalls).toContainEqual({ table: 'weeks', op: 'eq', payload: ['pool_id', 'pool1'] });
    expect(weekEqCalls).toContainEqual({ table: 'weeks', op: 'eq', payload: ['season', 2026] });
    const orderCall = calls.find((c) => c.table === 'weeks' && c.op === 'order');
    expect(orderCall?.payload).toEqual(['week_number', { ascending: false }]);
  });

  it('returns null when the pool has no weeks yet, rather than throwing', async () => {
    const { client } = stubClient([]);
    const repos = createRepositories(client);
    expect(await repos.weeks.latestForPool('pool1', 2026)).toBeNull();
  });

  it('throws rather than returning a fake week row when upsert reports no row', async () => {
    const { client } = stubClient([]);
    const repos = createRepositories(client);
    await expect(repos.weeks.upsert('pool1', 2026, 3, null)).rejects.toThrow(/no row/i);
  });

  it('fetches a single entry by id', async () => {
    const { client, calls } = stubClient([{ id: 'e1', week_id: 'w1' }]);
    const repos = createRepositories(client);
    const entry = await repos.entries.getById('e1');
    expect(entry).toEqual({ id: 'e1', week_id: 'w1' });
    const eqCall = calls.find((c) => c.op === 'eq');
    expect(eqCall?.payload).toEqual(['id', 'e1']);
  });

  it('returns null for an entry id that does not exist', async () => {
    const { client } = stubClient([]);
    const repos = createRepositories(client);
    expect(await repos.entries.getById('nope')).toBeNull();
  });

  it('marks a payment only while it is still unpaid', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.entries.markPaid('e1', 'cashapp', 'sports-pool-os1');
    expect(calls.some((c) => c.op === 'update' && c.table === 'entries')).toBe(true);
    const isCall = calls.find((c) => c.op === 'is');
    expect(isCall?.payload).toEqual(['paid_at', null]);
  });

  it('writes a null confirmed_by when no commissioner is identified, rather than a placeholder string', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.entries.markPaid('e1', 'cashapp', null);
    const updateCall = calls.find((c) => c.op === 'update' && c.table === 'entries')!;
    const [payload] = updateCall.payload as [{ confirmed_by: string | null }];
    expect(payload.confirmed_by).toBeNull();
  });

  it('claims an agent run and reports whether it won', async () => {
    const { client, calls } = stubClient([{ id: 'ar1' }]);
    const repos = createRepositories(client);
    const won = await repos.agentRuns.claim('pool1', 'scorekeeper', 'scorekeeper:pool1:1');
    expect(won).toBe(true);
    const call = calls.find((c) => c.op === 'insert')!;
    expect(call.table).toBe('agent_runs');
  });

  it('reports a lost agent-run claim rather than throwing on a duplicate key', async () => {
    const { client } = stubClient([], { code: '23505', message: 'duplicate key' });
    const repos = createRepositories(client);
    expect(await repos.agentRuns.claim('pool1', 'scorekeeper', 'k')).toBe(false);
  });

  it('claims a notification the same way', async () => {
    const { client, calls } = stubClient([{ id: 'n1' }]);
    const repos = createRepositories(client);
    const won = await repos.notifications.claim('p1', 'email', 'unpaid_nag', 'unpaid:w1:p1');
    expect(won).toBe(true);
    expect(calls.find((c) => c.op === 'insert')!.table).toBe('notifications');
  });

  it('replaces a week\'s results by clearing the week first, then upserting', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.weekResults.replaceForWeek('w1', [
      { week_id: 'w1', player_id: 'p1', correct: 10, incorrect: 3, voided: 0, tiebreak_delta: 2, rank: 1, payout_cents: 2000 },
    ]);
    const deleteCall = calls.find((c) => c.op === 'delete')!;
    expect(deleteCall.table).toBe('week_results');
    const eqCall = calls.find((c) => c.op === 'eq' && c.table === 'week_results');
    expect(eqCall?.payload).toEqual(['week_id', 'w1']);
    const call = calls.find((c) => c.op === 'upsert')!;
    expect(call.table).toBe('week_results');
    const [, opts] = call.payload as [unknown, { onConflict?: string } | undefined];
    expect(opts?.onConflict).toBe('week_id,player_id');
  });

  it('releases a notification claim so the next tick can retry', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.notifications.release('picks_open:w1:p1');
    const deleteCall = calls.find((c) => c.op === 'delete')!;
    expect(deleteCall.table).toBe('notifications');
    const eqCall = calls.find((c) => c.op === 'eq' && c.table === 'notifications');
    expect(eqCall?.payload).toEqual(['dedupe_key', 'picks_open:w1:p1']);
  });

  it('freezes a week only while it is not already frozen', async () => {
    const { client, calls } = stubClient();
    const repos = createRepositories(client);
    await repos.weeks.setStatus('w1', 'frozen');
    expect(calls.some((c) => c.op === 'update' && c.table === 'weeks')).toBe(true);
    const neqCall = calls.find((c) => c.op === 'neq');
    expect(neqCall?.payload).toEqual(['status', 'frozen']);
  });
  it('creates a player and returns the stored row', async () => {
    const { client, calls } = stubClient([{ id: 'p1', name: 'Bill', magic_token: 'tok' }]);
    const repos = createRepositories(client);
    const row = await repos.players.create({
      pool_id: 'pool1', name: 'Bill', email: 'bill@x.test', phone: null,
      magic_token: 'tok', is_commissioner: false, is_active: true,
    });
    expect(row).toMatchObject({ id: 'p1', magic_token: 'tok' });
    expect(calls.find((c) => c.op === 'insert')!.table).toBe('players');
  });

  it('deactivates a player rather than deleting them', async () => {
    const { client, calls } = stubClient([{ id: 'p1' }]);
    const repos = createRepositories(client);
    await repos.players.setActive('p1', false);
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.table).toBe('players');
    expect(update.payload).toEqual([{ is_active: false }, undefined]);
  });

  it('deletes an entry by id', async () => {
    const { client, calls } = stubClient([]);
    const repos = createRepositories(client);
    await repos.entries.remove('e1');
    expect(calls.find((c) => c.op === 'delete')!.table).toBe('entries');
  });

  it('locks a card by stamping the entry, and unlocks by clearing it', async () => {
    const { client, calls } = stubClient([{ id: 'e1' }]);
    const repos = createRepositories(client);

    await repos.entries.setLocked('p1', 'w1', true);
    const locked = calls.find((c) => c.op === 'update')!;
    expect(locked.table).toBe('entries');
    const [payload] = locked.payload as [{ locked_at: string | null }];
    expect(typeof payload.locked_at).toBe('string');

    calls.length = 0;
    await repos.entries.setLocked('p1', 'w1', false);
    const [cleared] = calls.find((c) => c.op === 'update')!.payload as [{ locked_at: string | null }];
    expect(cleared.locked_at).toBeNull();
  });

  it('sets an address on a player who joined without one', async () => {
    const { client, calls } = stubClient([{ id: 'p1', email: 'ron@x.test' }]);
    const repos = createRepositories(client);

    expect(await repos.players.setEmail('p1', 'ron@x.test')).toBe('ok');
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.table).toBe('players');
    expect(update.payload).toEqual([{ email: 'ron@x.test' }, undefined]);
  });

  it('reports a duplicate address as a value, not an exception', async () => {
    // Same partial unique index that makes re-pasting a roster safe. The
    // console has to say "somebody already has that", not crash.
    const { client } = stubClient([], { code: '23505', message: 'duplicate key' });
    const repos = createRepositories(client);
    expect(await repos.players.setEmail('p1', 'taken@x.test')).toBe('duplicate');
  });

  it('returns null rather than throwing when the pool already has that address', async () => {
    const { client } = stubClient([], { code: '23505', message: 'duplicate key' });
    const repos = createRepositories(client);
    const row = await repos.players.create({
      pool_id: 'pool1', name: 'Bill', email: 'bill@x.test', phone: null,
      magic_token: 'tok', is_commissioner: false, is_active: true,
    });
    expect(row).toBeNull();
  });

  it('throws on a database failure that is not a duplicate', async () => {
    const { client } = stubClient([], { code: '08006', message: 'connection failure' });
    const repos = createRepositories(client);
    await expect(
      repos.players.create({
        pool_id: 'pool1', name: 'Bill', email: 'bill@x.test', phone: null,
        magic_token: 'tok', is_commissioner: false, is_active: true,
      }),
    ).rejects.toThrow('connection failure');
  });
});
