import { describe, it, expect } from 'vitest';
import { toLedgerEntry, toPickInput, toScoredGame, toStandingsInput, toTiebreakGuess } from '@/lib/adapt';
import type { EntryRow, GameRow, PickRow, PlayerRow, TiebreakerGuessRow, WeekRow } from '@/lib/db/types';

const gameRow: GameRow = {
  id: 'g1',
  external_id: 'e1',
  season: 2026,
  week: 3,
  home_team: 'Minnesota Vikings',
  away_team: 'Green Bay Packers',
  home_abbr: 'MIN',
  away_abbr: 'GB',
  kickoff_at: '2026-09-20T17:00:00.000Z',
  home_score: 24,
  away_score: 20,
  status: 'final',
  updated_at: '',
};

const pickRow: PickRow = {
  id: 'pk1',
  player_id: 'p1',
  week_id: 'w1',
  game_id: 'g1',
  picked_abbr: 'MIN',
  is_auto: true,
  created_at: '',
  updated_at: '',
};

const entryRow: EntryRow = {
  id: 'en1',
  player_id: 'p1',
  week_id: 'w1',
  buy_in_cents: 1000,
  paid_at: null,
  method: null,
  confirmed_by: null, locked_at: null,
  created_at: '',
};

const guessRow: TiebreakerGuessRow = {
  id: 'tg1',
  player_id: 'p1',
  week_id: 'w1',
  predicted_total: 47,
  updated_at: '',
};

const playerRow: PlayerRow = {
  id: 'p1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'tok',
  is_commissioner: true,
  is_active: true,
  created_at: '',
};

const weekRow: WeekRow = {
  id: 'w1',
  pool_id: 'pool1',
  season: 2026,
  week_number: 3,
  tiebreak_game_id: 'g1',
  lock_override: null,
  status: 'live',
  frozen_at: null,
  created_at: '',
};

describe('row adapters', () => {
  it('maps a game row to the shape the scorer needs and nothing more', () => {
    expect(toScoredGame(gameRow)).toEqual({
      id: 'g1',
      homeAbbr: 'MIN',
      awayAbbr: 'GB',
      homeScore: 24,
      awayScore: 20,
      status: 'final',
    });
  });

  it('carries the auto flag through on a pick', () => {
    expect(toPickInput(pickRow)).toEqual({
      playerId: 'p1',
      gameId: 'g1',
      pickedAbbr: 'MIN',
      isAuto: true,
    });
  });

  it('maps a guess row', () => {
    expect(toTiebreakGuess(guessRow)).toEqual({ playerId: 'p1', predictedTotal: 47 });
  });

  it('maps an entry row, preserving unpaid as null', () => {
    expect(toLedgerEntry(entryRow)).toEqual({ playerId: 'p1', buyInCents: 1000, paidAt: null });
  });

  it('assembles a complete standings input from rows', () => {
    const input = toStandingsInput({
      players: [playerRow],
      games: [gameRow],
      picks: [pickRow],
      guesses: [guessRow],
      week: weekRow,
    });
    expect(input.players).toEqual([{ id: 'p1', name: 'Bill' }]);
    expect(input.tiebreakGameId).toBe('g1');
    expect(input.games[0]!.id).toBe('g1');
    expect(input.picks[0]!.playerId).toBe('p1');
    expect(input.guesses[0]!.predictedTotal).toBe(47);
  });
});
