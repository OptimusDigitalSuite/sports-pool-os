import { Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/ui/cn';
import type { SeasonRow } from '@/lib/scoring/seasonStandings';

function money(cents: number): string {
  const sign = cents < 0 ? '−' : cents > 0 ? '+' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(0)}`;
}

/**
 * The season table — what the pool looks like in November rather than on
 * Sunday night.
 *
 * Money is `--money-amber-*` and only that. The hot accent means live and
 * wins, and DESIGN.md §2 forbids the two sitting adjacent, which is why a
 * winning net is amber here rather than the red used on the weekly table's
 * leader. Nothing on this table is live.
 *
 * A negative net renders in the same amber at reduced emphasis rather than
 * in a "bad" colour. Most players are down most of the season — one person
 * wins each week — and colouring the normal state as a warning would be
 * both wrong and relentless.
 */
export function SeasonTable({
  rows,
  viewerId,
  season,
}: {
  rows: SeasonRow[];
  viewerId: string;
  season: number;
}) {
  if (rows.length === 0) {
    return (
      <Panel className="mt-6">
        <h2 className="font-[family-name:var(--font-barlow-condensed)] text-xl">Season</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Fills in once the first week is settled.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="mt-6" innerClassName="p-0">
      <div className="px-5 pt-5 pb-3">
        <h2 className="font-[family-name:var(--font-barlow-condensed)] text-xl">
          Season {season}
        </h2>
        <p className="text-sm text-[var(--text-tertiary)]">Settled weeks only</p>
      </div>

      <ul className="divide-y divide-[var(--border-hairline)]">
        {rows.map((row, index) => (
          <li
            key={row.playerId}
            className={cn(
              'grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 px-5 py-3',
              row.playerId === viewerId && 'bg-[var(--bg-surface)]',
            )}
          >
            <span className="tabular text-sm text-[var(--text-tertiary)]">{index + 1}</span>

            <span>
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {row.name}
              </span>
              <span className="block text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                {row.weeksWon} {row.weeksWon === 1 ? 'week' : 'weeks'} won ·{' '}
                <span className="tabular">{row.correct}</span>–
                <span className="tabular">{row.incorrect}</span> · {row.weeksPlayed} played
              </span>
            </span>

            <span
              className={cn(
                'tabular text-right text-sm font-semibold',
                row.netCents > 0
                  ? 'text-[var(--money-amber-500)]'
                  : 'text-[var(--text-tertiary)]',
              )}
            >
              {money(row.netCents)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
