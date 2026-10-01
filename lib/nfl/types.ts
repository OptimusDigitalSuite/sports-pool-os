export type GameStatus = 'scheduled' | 'in_progress' | 'final';

export interface NflGame {
  externalId: string;
  season: number;
  week: number;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  /** ISO 8601, UTC. */
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
}

export interface NflDataProvider {
  readonly name: 'espn' | 'manual';
  fetchWeek(season: number, week: number): Promise<NflGame[]>;
}
