import type { EntryRow, GameRow, PickRow, PlayerRow, TiebreakerGuessRow, WeekRow } from '@/lib/db/types';
import type { LedgerEntry } from '@/lib/ledger/types';
import type { PickInput, ScoredGame, StandingsInput, TiebreakGuess } from '@/lib/scoring/types';

/**
 * The single translation layer between database rows and the pure core.
 * Nothing outside this file should read a row shape into a scoring or
 * ledger function.
 */

export function toScoredGame(row: GameRow): ScoredGame {
  return {
    id: row.id,
    homeAbbr: row.home_abbr,
    awayAbbr: row.away_abbr,
    homeScore: row.home_score,
    awayScore: row.away_score,
    status: row.status,
  };
}

export function toPickInput(row: PickRow): PickInput {
  return {
    playerId: row.player_id,
    gameId: row.game_id,
    pickedAbbr: row.picked_abbr,
    isAuto: row.is_auto,
  };
}

export function toTiebreakGuess(row: TiebreakerGuessRow): TiebreakGuess {
  return { playerId: row.player_id, predictedTotal: row.predicted_total };
}

export function toLedgerEntry(row: EntryRow): LedgerEntry {
  return { playerId: row.player_id, buyInCents: row.buy_in_cents, paidAt: row.paid_at };
}

export interface StandingsRows {
  players: PlayerRow[];
  games: GameRow[];
  picks: PickRow[];
  guesses: TiebreakerGuessRow[];
  week: WeekRow;
}

export function toStandingsInput(rows: StandingsRows): StandingsInput {
  return {
    players: rows.players.map((p) => ({ id: p.id, name: p.name })),
    games: rows.games.map(toScoredGame),
    picks: rows.picks.map(toPickInput),
    guesses: rows.guesses.map(toTiebreakGuess),
    tiebreakGameId: rows.week.tiebreak_game_id,
  };
}
