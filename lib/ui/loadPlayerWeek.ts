import type { Repositories } from '@/lib/db/repositories';
import { gamesInWeek } from '@/lib/services/weekGames';
import type { EntryRow, GameRow, PickRow, PoolRow, TiebreakerGuessRow, WeekRow } from '@/lib/db/types';

export interface PlayerWeek {
  player: { id: string; name: string; isCommissioner: boolean };
  pool: PoolRow;
  week: WeekRow;
  games: GameRow[];
  picks: PickRow[];
  guess: TiebreakerGuessRow | null;
  entry: EntryRow | null;
}

/**
 * Everything one player's picks page needs, resolved from their magic link.
 *
 * The token is a credential: it is used to find the player and then dropped.
 * Nothing it returns carries the token onward, so it cannot reach a log, a
 * page title, or a client bundle.
 */
export async function loadPlayerWeek(
  repos: Repositories,
  token: string,
  weekNumber: number,
): Promise<PlayerWeek | null> {
  const player = await repos.players.getByToken(token);
  if (!player || !player.is_active) return null;

  const pool = await repos.pools.get(player.pool_id);
  if (!pool) return null;

  const week = await repos.weeks.find(pool.id, pool.season, weekNumber);
  if (!week) return null;

  const [games, allPicks, allGuesses, allEntries] = await Promise.all([
    gamesInWeek(repos, week),
    repos.picks.listByWeek(week.id),
    repos.guesses.listByWeek(week.id),
    repos.entries.listByWeek(week.id),
  ]);

  return {
    player: { id: player.id, name: player.name, isCommissioner: player.is_commissioner },
    pool,
    week,
    games,
    picks: allPicks.filter((pick) => pick.player_id === player.id),
    guess: allGuesses.find((g) => g.player_id === player.id) ?? null,
    entry: allEntries.find((e) => e.player_id === player.id) ?? null,
  };
}
