import type { EntryRow, PlayerRow, WeekResultRow } from '@/lib/db/types';

export interface SeasonRow {
  playerId: string;
  name: string;
  /** Weeks this player entered — not weeks the pool has played. */
  weeksPlayed: number;
  /** Weeks they finished first. Ties share the rank, so two can both win. */
  weeksWon: number;
  correct: number;
  incorrect: number;
  /** Everything they have been paid out across the season. */
  wonCents: number;
  /** Everything they owe or have paid in, whether or not it has been settled. */
  paidInCents: number;
  /** wonCents − paidInCents. Negative is normal; one person wins each week. */
  netCents: number;
}

/**
 * Season-long standings from the settled weekly results.
 *
 * Only frozen weeks contribute — `week_results` rows exist only once a week
 * has been scored — so a week in progress never moves anyone up the table.
 *
 * `paidInCents` counts every entry, paid or not. Rank is what someone owes
 * for playing, not what they have got round to sending; the ledger screen is
 * where "has it actually arrived" lives, and conflating the two would let a
 * slow payer quietly show a better season than a prompt one.
 *
 * Ordered by weeks won, then games correct, then name — money is a column,
 * not the ranking. Somebody who wins one big week is not having a better
 * season than somebody who wins three.
 */
export function buildSeasonStandings(
  players: readonly PlayerRow[],
  entries: readonly EntryRow[],
  results: readonly WeekResultRow[],
): SeasonRow[] {
  const rows = new Map<string, SeasonRow>();

  for (const player of players) {
    rows.set(player.id, {
      playerId: player.id,
      name: player.name,
      weeksPlayed: 0,
      weeksWon: 0,
      correct: 0,
      incorrect: 0,
      wonCents: 0,
      paidInCents: 0,
      netCents: 0,
    });
  }

  for (const entry of entries) {
    const row = rows.get(entry.player_id);
    // A result for someone no longer in the pool is skipped rather than
    // resurrected into the table under a name we no longer have.
    if (!row) continue;
    row.weeksPlayed += 1;
    row.paidInCents += entry.buy_in_cents;
  }

  for (const result of results) {
    const row = rows.get(result.player_id);
    if (!row) continue;
    row.correct += result.correct;
    row.incorrect += result.incorrect;
    row.wonCents += result.payout_cents;
    if (result.rank === 1) row.weeksWon += 1;
  }

  for (const row of rows.values()) {
    row.netCents = row.wonCents - row.paidInCents;
  }

  return [...rows.values()]
    .filter((row) => row.weeksPlayed > 0)
    .sort(
      (a, b) =>
        b.weeksWon - a.weeksWon ||
        b.correct - a.correct ||
        a.name.localeCompare(b.name),
    );
}
