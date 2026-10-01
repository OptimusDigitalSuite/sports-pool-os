import { Resend } from 'resend';
import Anthropic from '@anthropic-ai/sdk';
import { executeActions, type ExecutionReport } from '@/lib/agents/executor';
import { runTick, type TickReport } from '@/lib/agents/tick';
import type { Action, TickState } from '@/lib/agents/types';
import { createRepositories, type Repositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { createEspnProvider } from '@/lib/nfl/espnProvider';
import { gamesInWeek } from '@/lib/services/weekGames';
import { createManualProvider } from '@/lib/nfl/manualProvider';
import { createNoopChannel } from '@/lib/notify/noop';
import { createResendChannel } from '@/lib/notify/resend';
import type { NotifyChannel } from '@/lib/notify/types';
import { generateRecap } from '@/lib/recap/generate';
import { plainSummary, type RecapInput } from '@/lib/recap/summary';
import { freezeWeek } from '@/lib/services/freezeWeek';
import { submitPick } from '@/lib/services/submitPick';
import { syncWeek } from '@/lib/services/syncSchedule';

/**
 * The minimal slice of the Supabase (PostgREST) query builder that
 * `loadTickState`'s two direct queries need. A stub satisfying this — not
 * the real `@supabase/supabase-js` client — is what lets `loadTickState` and
 * `runAllPools` be driven from tests without a database.
 */
export interface SupabaseQueryLike extends PromiseLike<{ data: unknown[] | null; error: unknown }> {
  eq(column: string, value: unknown): SupabaseQueryLike;
  order(column: string, opts?: { ascending?: boolean }): SupabaseQueryLike;
  limit(n: number): SupabaseQueryLike;
}

export interface SupabaseClientLike {
  from(table: string): {
    select(columns?: string): SupabaseQueryLike;
  };
}

export interface PoolRunnerDeps {
  client: SupabaseClientLike;
  repos: Repositories;
  channel: NotifyChannel;
  generateRecapFor: (input: RecapInput, onDegraded?: (reason: string) => void) => Promise<string>;
  now(): Date;
}

/**
 * Composition root. Every other module takes its dependencies as arguments;
 * this is the only place that reaches for environment variables and real
 * clients, which is what keeps the rest of the codebase testable.
 */
export async function runTickForAllPools(): Promise<Record<string, TickReport>> {
  const client = createServiceClient();
  const repos = createRepositories(client);

  // Without a verified sender we cannot send mail at all. Use the noop channel
  // rather than a Resend client pointed at an unverified default: the agents
  // still run, decisions are still recorded, and nothing pretends a message
  // went out.
  const from = process.env.RESEND_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  const channel: NotifyChannel =
    from && apiKey ? createResendChannel({ from, client: new Resend(apiKey) }) : createNoopChannel();

  // A missing or bad ANTHROPIC_API_KEY must not stop scoring, freezing, or
  // paying. Without a client the recap simply falls back to the plain summary,
  // which is exactly what generateRecap does on any other failure.
  let anthropic: Anthropic | null = null;
  try {
    anthropic = new Anthropic();
  } catch {
    anthropic = null;
  }

  const { data } = await client.from('pools').select('id');
  const poolIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);

  // The real client is a strict superset of SupabaseClientLike; TypeScript's
  // structural check against its generic, self-referential builder types is
  // what blows up here, not an actual shape mismatch.
  const clientLike = client as unknown as SupabaseClientLike;

  return runAllPools(
    {
      client: clientLike,
      repos,
      channel,
      now: () => new Date(),
      generateRecapFor: makeGenerateRecapFor(anthropic),
    },
    poolIds,
  );
}

/**
 * Builds the recap generator used by a tick, given whatever Anthropic client
 * (or lack of one) `runTickForAllPools` resolved. Split out so the missing-key
 * fallback path — the single most common reason a deployment silently serves
 * plain summaries — is unit-testable without a database or environment.
 */
export function makeGenerateRecapFor(
  anthropic: Anthropic | null,
): (input: RecapInput, onDegraded?: (reason: string) => void) => Promise<string> {
  return (input, onDegraded) => {
    if (!anthropic) {
      onDegraded?.('no anthropic client configured');
      return Promise.resolve(plainSummary(input));
    }
    return generateRecap({ client: anthropic as never, onDegraded }, input);
  };
}

/**
 * One pass over every pool: provider selection, the executor wiring, and the
 * per-pool try/catch that keeps one pool's failure from stopping the rest.
 * Injectable so it can be driven by a stubbed client and repos in tests.
 */
export async function runAllPools(
  deps: PoolRunnerDeps,
  poolIds: string[],
): Promise<Record<string, TickReport>> {
  const reports: Record<string, TickReport> = {};
  for (const poolId of poolIds) {
    try {
      reports[poolId] = await runTick(
        {
          repos: deps.repos,
          now: deps.now,
          loadState: (id, now) => loadTickState(deps.client, deps.repos, id, now),
          execute: (state: TickState, actions: Action[]): Promise<ExecutionReport> => {
            // Each pool may run a different provider — manual pools have the
            // commissioner enter scores directly, so their "sync" is a no-op
            // rather than a call out to ESPN.
            const provider =
              state.pool.settings.provider === 'manual'
                ? createManualProvider([])
                : createEspnProvider();

            return executeActions(
              {
                repos: deps.repos,
                channel: deps.channel,
                appUrl: process.env.NEXT_PUBLIC_BASE_URL ?? '',
                submitPick,
                freezeWeek,
                syncWeek,
                provider,
                generateRecap: deps.generateRecapFor,
              },
              state,
              actions,
            );
          },
        },
        poolId,
      );
    } catch (error) {
      // One pool's failure must not stop the others — the cron fires for all
      // of them at once.
      reports[poolId] = {
        claimed: false,
        actions: 0,
        execution: {
          performed: 0,
          skipped: 0,
          failed: 1,
          errors: [error instanceof Error ? error.message : String(error)],
        },
      };
    }
  }
  return reports;
}

export async function loadTickState(
  client: SupabaseClientLike,
  repos: Repositories,
  poolId: string,
  now: Date,
): Promise<TickState | null> {
  const pool = await repos.pools.get(poolId);
  if (!pool) return null;

  // The pool's current week: highest week number within the pool's own
  // season. Filtering on season matters once a second season exists in the
  // table — repos.weeks.latestForPool is the one tested place that filter is
  // applied.
  const existingWeek = (await repos.weeks.latestForPool(poolId, pool.season)) ?? undefined;

  // A brand-new pool has no weeks row yet, and nothing else ever creates
  // one — syncWeek does, but only in response to a sync_week action, and the
  // scorekeeper only emits that action for a week it can already see.
  // Returning null here left the pool permanently inert. Hand back a
  // synthetic, unsaved week 1 instead, so the scorekeeper has something to
  // sync against; every other agent sees an empty, unfrozen week and does
  // nothing until real games exist. `id: ''` marks it unsaved — the
  // executor's freeze_week guard refuses to act on it.
  const week: TickState['week'] =
    existingWeek ??
    ({
      id: '',
      pool_id: poolId,
      season: pool.season,
      week_number: 1,
      tiebreak_game_id: null,
      status: 'open',
      lock_override: null,
      frozen_at: null,
      created_at: '',
    } as TickState['week']);

  if (!existingWeek) {
    const players = await repos.players.listActive(poolId);
    return { pool, week, games: [], players, picks: [], guesses: [], entries: [], results: [], now };
  }

  const [games, players, picks, guesses, entries] = await Promise.all([
    gamesInWeek(repos, week),
    repos.players.listActive(poolId),
    repos.picks.listByWeek(week.id),
    repos.guesses.listByWeek(week.id),
    repos.entries.listByWeek(week.id),
  ]);

  const { data: resultRows } = await client.from('week_results').select('*').eq('week_id', week.id);

  return {
    pool,
    week,
    games,
    players,
    picks,
    guesses,
    entries,
    results: (resultRows ?? []) as TickState['results'],
    now,
  };
}
