import type { Repositories } from '@/lib/db/repositories';
import type { GameRow } from '@/lib/db/types';

/**
 * The games a week is actually played over.
 *
 * Everything downstream is derived from this list rather than from the raw
 * schedule: the deadline is its earliest kickoff, the pick list is its rows,
 * and grading counts its results. So excluding a game moves the deadline,
 * removes the buttons, and drops it from scoring in one stroke, with no
 * second rule to keep in step.
 */
export function withoutExcluded<T extends { id: string }>(
  games: readonly T[],
  excludedGameIds: readonly string[],
): T[] {
  if (excludedGameIds.length === 0) return [...games];
  const excluded = new Set(excludedGameIds);
  return games.filter((game) => !excluded.has(game.id));
}

export interface WeekRef {
  id: string;
  season: number;
  week_number: number;
}

export async function gamesInWeek(repos: Repositories, week: WeekRef): Promise<GameRow[]> {
  const [games, excluded] = await Promise.all([
    repos.games.listByWeek(week.season, week.week_number),
    repos.weekExclusions.listByWeek(week.id),
  ]);
  return withoutExcluded(games, excluded);
}
