export interface RecapRow {
  name: string;
  correct: number;
  incorrect: number;
  rank: number;
  payoutCents: number;
  tiebreakDelta: number | null;
  autoPicks: number;
}

export interface RecapInput {
  weekNumber: number;
  potCents: number;
  rows: RecapRow[];
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The fallback the week always gets. If Claude is unreachable, refuses, or
 * returns nothing usable, this runs instead — plain, correct, and never a
 * reason to hold up freezing a week.
 */
export function plainSummary(input: RecapInput): string {
  const ordered = [...input.rows].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const winners = ordered.filter((r) => r.rank === 1);

  const lines = [`Week ${input.weekNumber} — pot ${money(input.potCents)}`];
  if (winners.length > 0) {
    lines.push(
      `Winner: ${winners.map((w) => `${w.name} (${w.correct}-${w.incorrect}, ${money(w.payoutCents)})`).join(', ')}`,
    );
  }
  for (const row of ordered) {
    const auto = row.autoPicks > 0 ? ` — ${row.autoPicks} auto` : '';
    lines.push(`${row.rank}. ${row.name} ${row.correct}-${row.incorrect}${auto}`);
  }
  return lines.join('\n');
}
