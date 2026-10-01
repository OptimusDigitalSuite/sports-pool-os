import { toLedgerEntry, toStandingsInput } from '@/lib/adapt';
import type { NewWeekResult, Repositories } from '@/lib/db/repositories';
import { computePayouts } from '@/lib/ledger/payouts';
import { buildStandings } from '@/lib/scoring/standings';
import { gamesInWeek } from '@/lib/services/weekGames';

export class WeekFrozenError extends Error {
  constructor(weekId: string) {
    super(`WeekFrozenError: week ${weekId} is already frozen`);
    this.name = 'WeekFrozenError';
  }
}

export class WeekPoolMismatchError extends Error {
  constructor(weekId: string, poolId: string) {
    super(`WeekPoolMismatchError: week ${weekId} does not belong to pool ${poolId}`);
    this.name = 'WeekPoolMismatchError';
  }
}

export interface FreezeDeps {
  repos: Repositories;
}

/**
 * Turns a finished week into a permanent record: final standings, final
 * payouts, week marked frozen.
 *
 * Results are written before the status flips, so a crash between the two
 * leaves the week re-freezable rather than frozen with no results.
 * `replaceForWeek` clears the week's existing rows before writing the new
 * ones, so a retry after a player was deactivated between attempts cannot
 * leave a stale payout row behind — the week's payouts always sum to the pot.
 */
export async function freezeWeek(deps: FreezeDeps, poolId: string, weekId: string): Promise<void> {
  const pool = await deps.repos.pools.get(poolId);
  if (!pool) throw new Error(`pool ${poolId} not found`);

  const week = await deps.repos.weeks.getById(weekId);
  if (!week) throw new Error(`week ${weekId} not found`);
  // poolId and weekId arrive independently from the caller (the commissioner
  // console calls freezeWeek directly, not only the tick), so the pairing is
  // untrusted input on an irreversible path: verify the week actually belongs
  // to this pool before doing anything else, including before the
  // already-frozen check below (leaking "already frozen" for a foreign week
  // would confirm that week exists and its status).
  if (week.pool_id !== pool.id) throw new WeekPoolMismatchError(weekId, pool.id);
  if (week.status === 'frozen') throw new WeekFrozenError(weekId);

  const [players, games, picks, guesses, entries] = await Promise.all([
    deps.repos.players.listActive(pool.id),
    gamesInWeek(deps.repos, week),
    deps.repos.picks.listByWeek(week.id),
    deps.repos.guesses.listByWeek(week.id),
    deps.repos.entries.listByWeek(week.id),
  ]);

  const standings = buildStandings(toStandingsInput({ players, games, picks, guesses, week }));
  const payouts = computePayouts(standings, entries.map(toLedgerEntry));
  const payoutByPlayer = new Map(payouts.map((p) => [p.playerId, p.cents]));

  const rows: NewWeekResult[] = standings.map((s) => ({
    week_id: week.id,
    player_id: s.playerId,
    correct: s.correct,
    incorrect: s.incorrect,
    voided: s.voided,
    tiebreak_delta: s.tiebreakDelta,
    rank: s.rank,
    payout_cents: payoutByPlayer.get(s.playerId) ?? 0,
  }));

  await deps.repos.weekResults.replaceForWeek(week.id, rows);
  await deps.repos.weeks.setStatus(week.id, 'frozen');
}
