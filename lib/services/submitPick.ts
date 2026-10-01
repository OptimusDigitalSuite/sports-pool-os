import type { Repositories } from '@/lib/db/repositories';
import { isWeekLocked } from '@/lib/services/weekLock';
import { gamesInWeek } from '@/lib/services/weekGames';

export class PickRejectedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'PickRejectedError';
  }
}

export interface SubmitDeps {
  repos: Repositories;
  /** Injected so lock boundaries are testable to the second. */
  now: () => Date;
}

export interface SubmitPickInput {
  poolId: string;
  playerId: string;
  weekId: string;
  gameId: string;
  pickedAbbr: string;
  isAuto?: boolean;
  /** Only the auto-pick agent sets this, to fill a pick after its kickoff. */
  allowLocked?: boolean;
}

export interface SubmitTiebreakInput {
  poolId: string;
  playerId: string;
  weekId: string;
  predictedTotal: number;
}

/**
 * Kickoff in epoch milliseconds, rejecting an unreadable timestamp.
 *
 * Without this, `Date.parse` yields NaN, `now >= NaN` is false, and the game
 * would never lock — accepting a pick after the result is already known.
 * Locking is a money path, so it fails closed.
 */
function kickoffMs(kickoffAt: string, gameId: string): number {
  const ms = Date.parse(kickoffAt);
  if (Number.isNaN(ms)) {
    throw new PickRejectedError(`game ${gameId} has an unreadable kickoff time and cannot be picked`);
  }
  return ms;
}

async function loadOpenWeek(deps: SubmitDeps, poolId: string, weekId: string, playerId: string) {
  const pool = await deps.repos.pools.get(poolId);
  if (!pool) throw new PickRejectedError('pool not found');

  const week = await deps.repos.weeks.getById(weekId);
  if (!week) throw new PickRejectedError('week not found');
  if (week.pool_id !== pool.id) throw new PickRejectedError('that week belongs to a different pool');
  if (week.status === 'frozen') throw new PickRejectedError('this week is frozen and can no longer be changed');

  const player = await deps.repos.players.getById(playerId);
  if (!player) throw new PickRejectedError('player not found');
  if (player.pool_id !== pool.id) throw new PickRejectedError('that player is not in this pool');
  if (!player.is_active) throw new PickRejectedError('that player is no longer active in this pool');

  return { pool, week, player };
}

/**
 * The pool's single deadline: every game in the week closes when the first
 * one kicks off, subject to the commissioner's override.
 *
 * Loading the whole week's schedule to answer this is deliberate — the
 * deadline is a property of the week, not of the game being picked, and
 * deriving it from the game in hand was exactly the per-game rule this
 * replaced.
 */
async function weekIsLocked(deps: SubmitDeps, week: { id: string; season: number; week_number: number; status: 'open' | 'live' | 'frozen'; lock_override: 'locked' | 'open' | null }): Promise<boolean> {
  const games = await gamesInWeek(deps.repos, week);
  return isWeekLocked({
    status: week.status,
    lockOverride: week.lock_override,
    kickoffs: games.map((game) => game.kickoff_at),
    now: deps.now(),
  });
}

/**
 * The player's own lock on their card.
 *
 * Distinct from the week deadline: that one stops everybody at a fixed
 * moment, this one is a finished player saying "nothing more from this
 * phone". Enforced here rather than only in the UI, because a pocket tap
 * reaches the same action a deliberate one does — and because the optimistic
 * pick list would otherwise show a change the server quietly refused.
 */
async function cardIsLocked(deps: SubmitDeps, weekId: string, playerId: string): Promise<boolean> {
  const entries = await deps.repos.entries.listByWeek(weekId);
  const entry = entries.find((row) => row.player_id === playerId);
  return entry?.locked_at != null;
}

export async function submitPick(deps: SubmitDeps, input: SubmitPickInput): Promise<void> {
  const { pool, week } = await loadOpenWeek(deps, input.poolId, input.weekId, input.playerId);

  const game = await deps.repos.games.getById(input.gameId);
  if (!game) throw new PickRejectedError('game not found');

  if (game.season !== week.season || game.week !== week.week_number) {
    throw new PickRejectedError('that game is not part of this week');
  }

  if (input.pickedAbbr !== game.home_abbr && input.pickedAbbr !== game.away_abbr) {
    throw new PickRejectedError(`${input.pickedAbbr} is not playing in this game`);
  }

  // Still parsed, and still fatal if unreadable: a game whose kickoff cannot
  // be read must not be picked even while the week as a whole is open.
  kickoffMs(game.kickoff_at, game.id);

  // A game the week does not count is not merely hidden from the pick list.
  // The action takes a game id, so refusing it here is what actually stops a
  // pick that could never be graded.
  const excluded = await deps.repos.weekExclusions.listByWeek(week.id);
  if (excluded.includes(game.id)) {
    throw new PickRejectedError('that game does not count in this week');
  }

  if (!input.allowLocked && (await weekIsLocked(deps, week))) {
    throw new PickRejectedError('picks are locked for this week — the first game has kicked off');
  }

  // allowLocked is the auto-pick agent's flag: the lock stops a pocket, not
  // the agent filling a half-finished card at kickoff.
  if (!input.allowLocked && (await cardIsLocked(deps, week.id, input.playerId))) {
    throw new PickRejectedError('your card is locked — unlock it to make changes');
  }

  if (input.isAuto) {
    // Auto-pick fills gaps for players already in the week. It must never
    // create an obligation for someone who chose to sit out.
    const entries = await deps.repos.entries.listByWeek(week.id);
    if (!entries.some((entry) => entry.player_id === input.playerId)) {
      throw new PickRejectedError('auto-pick cannot enter a player who did not join this week');
    }
  } else {
    // Entry is opt-in by participation: the first manual pick creates it.
    await deps.repos.entries.ensure(input.playerId, week.id, pool.buy_in_cents);
  }

  await deps.repos.picks.upsert({
    player_id: input.playerId,
    week_id: week.id,
    game_id: game.id,
    picked_abbr: input.pickedAbbr,
    is_auto: input.isAuto ?? false,
  });
}

export async function submitTiebreak(deps: SubmitDeps, input: SubmitTiebreakInput): Promise<void> {
  if (!Number.isInteger(input.predictedTotal) || input.predictedTotal < 0) {
    throw new PickRejectedError('predicted total must be a whole number of points, zero or more');
  }

  const { pool, week } = await loadOpenWeek(deps, input.poolId, input.weekId, input.playerId);

  // The guess closes with the picks, not at the Monday night game it
  // describes. Left open until then, a player could watch the whole week
  // play out and only then choose the number they needed.
  if (await weekIsLocked(deps, week)) {
    throw new PickRejectedError('picks are locked for this week — the first game has kicked off');
  }

  if (await cardIsLocked(deps, week.id, input.playerId)) {
    throw new PickRejectedError('your card is locked — unlock it to make changes');
  }

  await deps.repos.entries.ensure(input.playerId, week.id, pool.buy_in_cents);
  await deps.repos.guesses.upsert(input.playerId, week.id, input.predictedTotal);
}
