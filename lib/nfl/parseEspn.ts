import { scoreboardSchema } from '@/lib/nfl/espnSchema';
import type { GameStatus, NflGame } from '@/lib/nfl/types';

export class EspnSchemaError extends Error {
  constructor(detail: string) {
    super(`EspnSchemaError: ${detail}`);
    this.name = 'EspnSchemaError';
  }
}

/** ESPN status names that mean "this game is not going to finish right now." */
const NOT_PLAYED = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_SUSPENDED']);

function toStatus(
  state: 'pre' | 'in' | 'post',
  completed: boolean,
  name: string | undefined,
): GameStatus {
  // A postponed or canceled game arrives as state 'post' with completed false
  // and 0-0 scores. Trusting `state` alone would make it look final, grade as
  // a tie, void for everyone, and satisfy "every game settled" — freezing the
  // week before the game is played and paying out on it permanently.
  if (name !== undefined && NOT_PLAYED.has(name)) return 'scheduled';
  if (state === 'post' && !completed) return 'scheduled';
  if (completed) return 'final';
  if (state === 'in') return 'in_progress';
  return 'scheduled';
}

function toScore(raw: string | undefined, eventId: string, side: 'home' | 'away'): number {
  const value = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value)) {
    throw new EspnSchemaError(
      `event ${eventId} reported a non-numeric ${side} score: ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

export function parseEspnScoreboard(json: unknown, season: number, week: number): NflGame[] {
  const parsed = scoreboardSchema.safeParse(json);
  if (!parsed.success) {
    throw new EspnSchemaError(parsed.error.issues.map((i) => i.path.join('.') || 'root').join(', '));
  }

  return parsed.data.events.map((event) => {
    const competition = event.competitions[0]!;
    const home = competition.competitors.find((c) => c.homeAway === 'home');
    const away = competition.competitors.find((c) => c.homeAway === 'away');
    if (!home || !away) {
      throw new EspnSchemaError(`event ${event.id} is missing a home or away competitor`);
    }

    const status = toStatus(
      competition.status.type.state,
      competition.status.type.completed,
      competition.status.type.name,
    );
    const scored = status !== 'scheduled';

    const kickoff = new Date(event.date);
    if (Number.isNaN(kickoff.getTime())) {
      throw new EspnSchemaError(`event ${event.id} has an unparseable date: ${JSON.stringify(event.date)}`);
    }

    return {
      externalId: event.id,
      season,
      week,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      homeAbbr: home.team.abbreviation,
      awayAbbr: away.team.abbreviation,
      kickoffAt: kickoff.toISOString(),
      homeScore: scored ? toScore(home.score, event.id, 'home') : null,
      awayScore: scored ? toScore(away.score, event.id, 'away') : null,
      status,
    };
  });
}
