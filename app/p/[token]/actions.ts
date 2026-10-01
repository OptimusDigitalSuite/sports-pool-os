'use server';

import { revalidatePath } from 'next/cache';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { PickRejectedError, submitPick, submitTiebreak } from '@/lib/services/submitPick';

/**
 * Picks and guesses are written through the same engine functions the agents
 * use, so the server-side kickoff lock applies identically here. A rejection
 * is returned as a value the UI can show, never thrown at the user.
 */
export async function pickAction(
  token: string,
  gameId: string,
  pickedAbbr: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const repos = createRepositories(createServiceClient());
  const player = await repos.players.getByToken(token);
  if (!player) return { ok: false, reason: 'unknown link' };

  const pool = await repos.pools.get(player.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const game = await repos.games.getById(gameId);
  if (!game) return { ok: false, reason: 'game not found' };

  const week = await repos.weeks.find(pool.id, game.season, game.week);
  if (!week) return { ok: false, reason: 'week not found' };

  try {
    await submitPick(
      { repos, now: () => new Date() },
      { poolId: pool.id, playerId: player.id, weekId: week.id, gameId, pickedAbbr },
    );
    revalidatePath(`/p/${token}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof PickRejectedError) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function tiebreakAction(
  token: string,
  weekId: string,
  predictedTotal: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const repos = createRepositories(createServiceClient());
  const player = await repos.players.getByToken(token);
  if (!player) return { ok: false, reason: 'unknown link' };

  try {
    await submitTiebreak(
      { repos, now: () => new Date() },
      { poolId: player.pool_id, playerId: player.id, weekId, predictedTotal },
    );
    revalidatePath(`/p/${token}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof PickRejectedError) return { ok: false, reason: error.message };
    throw error;
  }
}

/**
 * The player's own lock on their card.
 *
 * Reversible on purpose: it guards against a phone in a pocket, not against
 * the player changing their mind, and an accidental lock that could not be
 * undone would be worse than the taps it prevents. The week's deadline is a
 * separate thing entirely and still applies.
 */
export async function setCardLocked(
  token: string,
  locked: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const repos = createRepositories(createServiceClient());
  const player = await repos.players.getByToken(token);
  if (!player || !player.is_active) return { ok: false, reason: 'unknown link' };

  const pool = await repos.pools.get(player.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) return { ok: false, reason: 'no week is open yet' };

  // Nothing to lock until they have entered. Locking an empty card would
  // create the obligation without a single pick behind it.
  const entries = await repos.entries.listByWeek(week.id);
  if (!entries.some((entry) => entry.player_id === player.id)) {
    return { ok: false, reason: 'make a pick first, then you can lock your card' };
  }

  await repos.entries.setLocked(player.id, week.id, locked);
  revalidatePath(`/p/${token}`);
  return { ok: true };
}
