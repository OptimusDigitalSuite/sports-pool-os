import type { GameStatus } from '@/lib/nfl/types';

/** The minimum a game must expose to be scored. Deliberately decoupled from NflGame. */
export interface ScoredGame {
  id: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  status: GameStatus;
}

export interface PickInput {
  playerId: string;
  gameId: string;
  pickedAbbr: string;
  isAuto: boolean;
}

export type PickOutcome = 'correct' | 'incorrect' | 'void' | 'pending';

export interface TiebreakGuess {
  playerId: string;
  predictedTotal: number;
}

export interface StandingsInput {
  players: { id: string; name: string }[];
  games: ScoredGame[];
  picks: PickInput[];
  guesses: TiebreakGuess[];
  tiebreakGameId: string | null;
}

export interface PlayerStanding {
  playerId: string;
  name: string;
  correct: number;
  incorrect: number;
  voided: number;
  /** Picks on games that have not finished — how much is still winnable. */
  stillAlive: number;
  predictedTotal: number | null;
  /** Absolute distance from the real combined total. Null until that game is final. */
  tiebreakDelta: number | null;
  rank: number;
}
