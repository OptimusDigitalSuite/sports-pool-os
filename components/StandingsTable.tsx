import { Figure } from '@/components/ui/Figure';
import { Panel } from '@/components/ui/Panel';
import { cn } from '@/lib/ui/cn';
import type { PlayerStanding } from '@/lib/scoring/types';

/**
 * The live leaderboard (DESIGN.md §7 "Standings Row"). Each row carries a
 * stable `view-transition-name` (keyed by player id) and a shared
 * `view-transition-class="standing"`, so *if* something calls
 * `document.startViewTransition()` around a re-render of this table, the
 * browser would interpolate each row from its old rank/position to its new
 * one, timed via `::view-transition-group(.standing)` in app/globals.css
 * (DESIGN.md §6.3 — duration-base/ease-spring, deliberately different from
 * the pick-row collapse's duration-slow, which is why the class exists
 * rather than a blanket `::view-transition-group(*)` rule).
 *
 * That reorder animation does not currently fire. The standings page
 * (app/p/[token]/standings/page.tsx) wraps this table in
 * `components/AutoRefresh.tsx`, which calls `router.refresh()` on an
 * interval, but `router.refresh()` returns `void` — there is no signal Next
 * exposes for "the new RSC payload has landed," which is what a view
 * transition would need to wrap in order to capture a real before/after.
 * The `view-transition-name`/`-class` plumbing here is in place and ready
 * for whenever that signal exists; until then this is a known gap, not an
 * oversight — see AutoRefresh.tsx for the full explanation.
 *

 * The pot is isolated to the header/summary area, styled only in
 * `--money-amber-*` and never `--accent-hot-*` — money and live/wins must
 * never share a colour or sit adjacent in the same visual cluster
 * (DESIGN.md §2, §8).
 */
export function StandingsTable({
  rows,
  potCents,
  tiebreakStarted,
  viewerId,
  livePulse = false,
}: {
  rows: PlayerStanding[];
  potCents: number;
  /** DESIGN.md §7: the tiebreak column appears once the week's last game has
   * kicked off — not once it's final. Naming this `tiebreakStarted` (rather
   * than `tiebreakSettled`) keeps the prop honest about what it actually
   * gates. */
  tiebreakStarted: boolean;
  /** The current viewer's player id, if any — gets the left-rule row treatment. */
  viewerId?: string;
  /** True while any game in the week is still in progress — drives the still-alive pulse dot. */
  livePulse?: boolean;
}) {
  return (
    <Panel className="mx-auto w-full max-w-[560px]">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-[family-name:var(--font-barlow-condensed)] text-2xl">Standings</h2>
        <span
          data-testid="pot"
          className="flex items-baseline gap-1 text-[var(--money-amber-500)] font-[family-name:var(--font-barlow-condensed)] text-xl font-bold"
        >
          <Figure value={potCents} label="pot" format="money" />
        </span>
      </div>

      <table className="w-full text-left">
        <thead className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th scope="col" className="w-8 py-2 font-normal">
              #
            </th>
            <th scope="col" className="py-2 font-normal">
              Player
            </th>
            <th scope="col" className="py-2 font-normal">
              W–L
            </th>
            <th scope="col" className="py-2 font-normal">
              Alive
            </th>
            {tiebreakStarted && (
              <th scope="col" className="py-2 font-normal">
                Tiebreak
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isViewer = viewerId !== undefined && row.playerId === viewerId;
            return (
              <tr
                key={row.playerId}
                data-player-id={row.playerId}
                style={{
                  viewTransitionName: `standing-${row.playerId}`,
                  viewTransitionClass: 'standing',
                }}
                className={cn(
                  'border-t border-[var(--border-hairline)] border-l-[3px]',
                  isViewer ? 'border-l-[var(--accent-hot-500)]' : 'border-l-transparent',
                )}
              >
                <td className="tabular py-2 text-[18px] font-[family-name:var(--font-barlow-condensed)] font-bold">
                  {row.rank}
                </td>
                <td data-testid="standing-name" className="max-w-[10rem] truncate whitespace-nowrap py-2 text-[var(--text-primary)]">
                  {row.name}
                </td>
                <td className="tabular py-2 text-[18px] font-[family-name:var(--font-barlow-condensed)] font-bold">
                  {row.correct}–{row.incorrect}
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1.5">
                    {livePulse && (
                      <span
                        aria-hidden="true"
                        data-live="true"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-hot-500)]"
                      />
                    )}
                    <Figure value={row.stillAlive} label="still alive" className="text-[var(--text-secondary)]" />
                  </span>
                </td>
                {tiebreakStarted && (
                  // DESIGN.md §7 shows the guess itself ("tiebreak: 47"),
                  // not the delta from the real total (which stays unknown
                  // — and unshowable — until the game is final anyway).
                  <td className="tabular py-2 text-[var(--text-secondary)]">
                    {row.predictedTotal ?? '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
