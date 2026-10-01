import { describe, it, expect } from 'vitest';
import { buildSeasonStandings } from '@/lib/scoring/seasonStandings';
import type { EntryRow, PlayerRow, WeekResultRow } from '@/lib/db/types';

const player = (id: string, name: string): PlayerRow => ({
  id,
  pool_id: 'pool1',
  name,
  email: null,
  phone: null,
  magic_token: `tok-${id}`,
  is_commissioner: false,
  is_active: true,
  created_at: '',
});

const entry = (playerId: string, weekId: string, paid = true): EntryRow => ({
  id: `${playerId}-${weekId}`,
  player_id: playerId,
  week_id: weekId,
  buy_in_cents: 1000,
  paid_at: paid ? '2026-09-10T00:00:00.000Z' : null,
  method: paid ? 'cashapp' : null,
  confirmed_by: null, locked_at: null,
  created_at: '',
});

const result = (
  playerId: string,
  weekId: string,
  over: Partial<WeekResultRow> = {},
): WeekResultRow => ({
  id: `${playerId}-${weekId}-r`,
  week_id: weekId,
  player_id: playerId,
  correct: 10,
  incorrect: 6,
  voided: 0,
  tiebreak_delta: 3,
  rank: 2,
  payout_cents: 0,
  ...over,
});

const players = [player('p1', 'Bill'), player('p2', 'Ada'), player('p3', 'Zoe')];

describe('buildSeasonStandings', () => {
  it('ranks by weeks won before games correct', () => {
    const rows = buildSeasonStandings(
      players,
      [entry('p1', 'w1'), entry('p2', 'w1')],
      [
        // Ada got more games right; Bill won the week.
        result('p1', 'w1', { rank: 1, correct: 9, payout_cents: 2000 }),
        result('p2', 'w1', { rank: 2, correct: 14 }),
      ],
    );
    expect(rows.map((r) => r.name)).toEqual(['Bill', 'Ada']);
  });

  it('falls back to games correct, then name', () => {
    const rows = buildSeasonStandings(
      players,
      [entry('p1', 'w1'), entry('p2', 'w1'), entry('p3', 'w1')],
      [
        result('p1', 'w1', { correct: 8 }),
        result('p2', 'w1', { correct: 12 }),
        result('p3', 'w1', { correct: 8 }),
      ],
    );
    expect(rows.map((r) => r.name)).toEqual(['Ada', 'Bill', 'Zoe']);
  });

  it('nets winnings against every buy-in, settled or not', () => {
    const rows = buildSeasonStandings(
      players,
      // Two weeks in, one of them still unpaid — still owed, still counted.
      [entry('p1', 'w1'), entry('p1', 'w2', false)],
      [
        result('p1', 'w1', { rank: 1, payout_cents: 3000 }),
        result('p1', 'w2', { rank: 3, payout_cents: 0 }),
      ],
    );
    const bill = rows.find((r) => r.name === 'Bill')!;
    expect(bill.paidInCents).toBe(2000);
    expect(bill.wonCents).toBe(3000);
    expect(bill.netCents).toBe(1000);
    expect(bill.weeksPlayed).toBe(2);
    expect(bill.weeksWon).toBe(1);
  });

  it('counts a shared week win for everyone who tied for first', () => {
    const rows = buildSeasonStandings(
      players,
      [entry('p1', 'w1'), entry('p2', 'w1')],
      [
        result('p1', 'w1', { rank: 1, payout_cents: 1000 }),
        result('p2', 'w1', { rank: 1, payout_cents: 1000 }),
      ],
    );
    expect(rows.every((r) => r.weeksWon === 1)).toBe(true);
  });

  it('omits players who have not entered a week', () => {
    const rows = buildSeasonStandings(players, [entry('p1', 'w1')], [result('p1', 'w1')]);
    expect(rows.map((r) => r.name)).toEqual(['Bill']);
  });

  it('ignores results for a player no longer in the pool', () => {
    // Deactivated mid-season: their rows survive in week_results, but there
    // is no name to show, so they are skipped rather than resurrected.
    const rows = buildSeasonStandings(
      [player('p1', 'Bill')],
      [entry('p1', 'w1'), entry('gone', 'w1')],
      [result('p1', 'w1'), result('gone', 'w1', { rank: 1, payout_cents: 5000 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Bill');
  });

  it('is empty before any week has settled', () => {
    expect(buildSeasonStandings(players, [], [])).toEqual([]);
  });
});
