import type { Repositories } from '@/lib/db/repositories';
import type { GameRow, WeekRow } from '@/lib/db/types';
import type { NflDataProvider } from '@/lib/nfl/types';

export interface SyncDeps {
  repos: Repositories;
  provider: NflDataProvider;
}

export interface SyncResult {
  week: WeekRow;
  games: GameRow[];
}

/**
 * Pulls a week from the provider, upserts it, and resolves the tiebreak game.
 *
 * The tiebreak game is whichever game kicks off last — normally Monday night,
 * but Week 18 has no Monday game and the rule still has to produce an answer.
 * It is resolved once here and stored on the week, so nothing downstream has
 * to re-derive it.
 */
export async function syncWeek(
  deps: SyncDeps,
  poolId: string,
  season: number,
  weekNumber: number,
): Promise<SyncResult> {
  const fetched = await deps.provider.fetchWeek(season, weekNumber);

  // Validate before writing: a malformed kickoff must never reach the games
  // table, because downstream locking reads it and `now >= NaN` is false,
  // which would leave that game permanently unlocked.
  for (const game of fetched) {
    if (Number.isNaN(Date.parse(game.kickoffAt))) {
      throw new MalformedKickoffError(game.externalId, game.kickoffAt);
    }
  }

  // A frozen week is settled and paid. Refuse before writing anything, not
  // after — otherwise a re-sync rewrites the scores underneath a result that
  // has already been used to pay people.
  const existing = await deps.repos.weeks.find(poolId, season, weekNumber);
  if (existing?.status === 'frozen') {
    throw new Error(`week ${weekNumber} is frozen and cannot be re-synced`);
  }

  await deps.repos.games.upsertMany(
    fetched.map((game) => ({
      external_id: game.externalId,
      season: game.season,
      week: game.week,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      home_abbr: game.homeAbbr,
      away_abbr: game.awayAbbr,
      kickoff_at: game.kickoffAt,
      home_score: game.homeScore,
      away_score: game.awayScore,
      status: game.status,
    })),
  );

  const stored = await deps.repos.games.listByWeek(season, weekNumber);
  const tiebreakGameId = pickTiebreakGameId(stored);

  const week = await deps.repos.weeks.upsert(poolId, season, weekNumber, tiebreakGameId);

  return { week, games: stored };
}

export class MalformedKickoffError extends Error {
  constructor(gameId: string, raw: string) {
    super(`MalformedKickoffError: game ${gameId} has an unparseable kickoff_at: ${JSON.stringify(raw)}`);
    this.name = 'MalformedKickoffError';
  }
}

/**
 * The week's tiebreak game is whichever game kicks off last.
 *
 * A malformed timestamp throws rather than being skipped or silently winning:
 * this id decides who takes the pot, so bad data must surface as an error the
 * commissioner console can show, not degrade into a wrong answer.
 *
 * Ties on identical kickoff times break on the lowest game id, so the choice
 * does not depend on the order the database happened to return rows in.
 */
export function pickTiebreakGameId(games: GameRow[]): string | null {
  let best: GameRow | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const game of games) {
    const time = Date.parse(game.kickoff_at);
    if (Number.isNaN(time)) {
      throw new MalformedKickoffError(game.id, game.kickoff_at);
    }
    if (best === null || time > bestTime || (time === bestTime && game.id < best.id)) {
      best = game;
      bestTime = time;
    }
  }

  return best?.id ?? null;
}
