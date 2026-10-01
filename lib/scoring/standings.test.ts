import { describe, it, expect } from 'vitest';
import { buildStandings, combinedTotal } from '@/lib/scoring/standings';
import type { PickInput, ScoredGame, StandingsInput } from '@/lib/scoring/types';

const finalGame = (id: string, home: number, away: number): ScoredGame => ({
  id,
  homeAbbr: `H${id}`,
  awayAbbr: `A${id}`,
  homeScore: home,
  awayScore: away,
  status: 'final',
});

const openGame = (id: string): ScoredGame => ({
  id,
  homeAbbr: `H${id}`,
  awayAbbr: `A${id}`,
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
});

const p = (playerId: string, gameId: string, abbr: string): PickInput => ({
  playerId,
  gameId,
  pickedAbbr: abbr,
  isAuto: false,
});

const base: StandingsInput = {
  players: [
    { id: 'p1', name: 'Bill' },
    { id: 'p2', name: 'Kenneth' },
  ],
  games: [],
  picks: [],
  guesses: [],
  tiebreakGameId: null,
};

describe('combinedTotal', () => {
  it('adds both sides of a final game', () => {
    expect(combinedTotal(finalGame('1', 27, 24))).toBe(51);
  });

  it('is null for an unfinished or missing game', () => {
    expect(combinedTotal(openGame('1'))).toBeNull();
    expect(combinedTotal(undefined)).toBeNull();
  });
});

describe('buildStandings', () => {
  it('counts correct, incorrect, void, and still-alive picks', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('1', 24, 20), finalGame('2', 17, 17), openGame('3')],
      picks: [p('p1', '1', 'H1'), p('p1', '2', 'H2'), p('p1', '3', 'H3'), p('p2', '1', 'A1')],
    });
    const bill = standings.find((s) => s.playerId === 'p1')!;
    expect(bill.correct).toBe(1);
    expect(bill.incorrect).toBe(0);
    expect(bill.voided).toBe(1);
    expect(bill.stillAlive).toBe(1);

    const kenneth = standings.find((s) => s.playerId === 'p2')!;
    expect(kenneth.correct).toBe(0);
    expect(kenneth.incorrect).toBe(1);
  });

  it('includes a player with no picks at all', () => {
    const standings = buildStandings({ ...base, games: [finalGame('1', 24, 20)] });
    expect(standings).toHaveLength(2);
    expect(standings[0]!.correct).toBe(0);
  });

  it('ranks by wins, most first', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('1', 24, 20)],
      picks: [p('p1', '1', 'H1'), p('p2', '1', 'A1')],
    });
    expect(standings[0]!.playerId).toBe('p1');
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.rank).toBe(2);
  });

  it('breaks a tie on wins using the closest combined-total guess', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('1', 24, 20), finalGame('tb', 27, 24)],
      picks: [p('p1', '1', 'H1'), p('p2', '1', 'H1')],
      guesses: [
        { playerId: 'p1', predictedTotal: 60 },
        { playerId: 'p2', predictedTotal: 48 },
      ],
      tiebreakGameId: 'tb',
    });
    expect(standings[0]!.playerId).toBe('p2');
    expect(standings[0]!.tiebreakDelta).toBe(3);
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.tiebreakDelta).toBe(9);
    expect(standings[1]!.rank).toBe(2);
  });

  it('leaves both players tied at rank 1 when wins and delta are identical', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('1', 24, 20), finalGame('tb', 27, 24)],
      picks: [p('p1', '1', 'H1'), p('p2', '1', 'H1')],
      guesses: [
        { playerId: 'p1', predictedTotal: 51 },
        { playerId: 'p2', predictedTotal: 51 },
      ],
      tiebreakGameId: 'tb',
    });
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.rank).toBe(1);
  });

  it('leaves the delta null while the tiebreak game is unfinished', () => {
    const standings = buildStandings({
      ...base,
      games: [openGame('tb')],
      guesses: [{ playerId: 'p1', predictedTotal: 44 }],
      tiebreakGameId: 'tb',
    });
    const bill = standings.find((s) => s.playerId === 'p1')!;
    expect(bill.predictedTotal).toBe(44);
    expect(bill.tiebreakDelta).toBeNull();
  });

  it('ties two players at rank 1 when neither guessed and their records match', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('1', 24, 20), finalGame('tb', 27, 24)],
      picks: [p('p1', '1', 'H1'), p('p2', '1', 'H1')],
      guesses: [],
      tiebreakGameId: 'tb',
    });
    expect(standings[0]!.tiebreakDelta).toBeNull();
    expect(standings[1]!.tiebreakDelta).toBeNull();
    expect(standings[0]!.rank).toBe(1);
    expect(standings[1]!.rank).toBe(1);
  });

  it('ranks a player who never guessed below one who did, at equal wins', () => {
    const standings = buildStandings({
      ...base,
      games: [finalGame('tb', 27, 24)],
      guesses: [{ playerId: 'p2', predictedTotal: 70 }],
      tiebreakGameId: 'tb',
    });
    expect(standings[0]!.playerId).toBe('p2');
    expect(standings[1]!.playerId).toBe('p1');
    expect(standings[1]!.tiebreakDelta).toBeNull();
  });

  it('breaks a dead tie on player id, not name, so two same-named players sort deterministically', () => {
    const standings = buildStandings({
      players: [
        { id: 'zeus', name: 'Bill' },
        { id: 'alpha', name: 'Bill' },
      ],
      games: [],
      picks: [],
      guesses: [],
      tiebreakGameId: null,
    });
    expect(standings.map((s) => s.playerId)).toEqual(['alpha', 'zeus']);
  });
});
