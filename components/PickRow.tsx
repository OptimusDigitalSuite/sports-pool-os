'use client';

import { Figure } from '@/components/ui/Figure';
import { kickoffLabel } from '@/lib/ui/clock';
import { cn } from '@/lib/ui/cn';

export interface PickRowGame {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  status: 'scheduled' | 'in_progress' | 'final';
}

const CHECK_GLYPH = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <path
      d="M3 8.5 6.5 12 13 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LOCK_GLYPH = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
  </svg>
);



/**
 * One game, in whichever of four states it is in (DESIGN.md §7): unpicked,
 * picked/collapsed, locked, and live (locked + pulse).
 *
 * The collapse on pick is the app's signature interaction: the list visibly
 * shrinks as you work through it, so sixteen games stop feeling like sixteen
 * games. Teams are plain text — never a logo, never an image (DESIGN.md §8:
 * "Team logos, wordmarks, or league branding of any kind" is banned outright).
 *
 * This component is purely presentational and holds no state of its own —
 * `pickedAbbr`/`isAuto`/`locked` are owned by the parent, which also owns
 * optimistic updates, the lock clock, and which row is reopened for editing.
 *
 * A collapsed row is a button that *reopens* the choice (`onReopen`), never
 * one that re-picks the team already picked — that was a dead tap target and
 * left a misclicked pick unchangeable until kickoff.
 */
export function PickRow({
  game,
  pickedAbbr,
  isAuto,
  locked,
  onPick,
  onReopen,
  timeZone,
}: {
  game: PickRowGame;
  pickedAbbr: string | null;
  isAuto: boolean;
  locked: boolean;
  onPick: (abbr: string) => void;
  onReopen?: () => void;
  /** The pool's zone. Passed in so server and client render the same string. */
  timeZone: string;
}) {
  // `data-live` drives the pulse from globals.css (DESIGN.md §6.4). Do not
  // also add an animate-* class here — two sources for one animation is how
  // it ends up pulsing at two different rates.
  const isLive = game.status === 'in_progress';

  // --- Locked (and Live, which is Locked + the pulse) --------------------
  if (locked) {
    // "If kicked off, the center kickoff-time chip is replaced by the
    // score" (DESIGN.md §7). A game that has started or finished has score
    // to show; a locked-but-not-yet-kicked-off game still shows kickoff time.
    const kickedOff = game.status !== 'scheduled';

    return (
      <div
        data-state="locked"
        data-live={isLive ? 'true' : undefined}
        className={cn(
          // No radius here — DESIGN.md §8 bans per-row card chrome in the
          // Pick List. State is carried by the background tint alone, flush
          // with the single Double-Bezel container's edges (see PickList.tsx).
          //
          // flex-col rather than a bare grid: the Live badge used to be
          // absolutely positioned above the row's own top edge (`-top-2`),
          // which was only safe with the old space-y gap between rows. Once
          // rows sat flush (`divide-y`, zero gap), that same offset hung the
          // badge into the row above. Putting the badge in normal flow, as
          // the row's own first child, keeps it inside this row's box no
          // matter what spacing the list around it uses.
          'relative flex flex-col gap-1 px-4 py-3',
          'bg-[var(--state-locked)]',
        )}
      >
        {isLive && (
          <span
            className={cn(
              'inline-flex w-fit items-center rounded-[var(--radius-sm)] px-2 py-0.5',
              'bg-[var(--accent-hot-600)] text-[var(--on-accent-hot)]',
              'text-[0.6875rem] font-semibold uppercase tracking-[0.06em]',
            )}
          >
            Live
          </span>
        )}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <LockedTeam
            abbr={game.awayAbbr}
            name={game.awayTeam}
            picked={pickedAbbr === game.awayAbbr}
            isAuto={isAuto}
          />

          {kickedOff ? (
            <span
              className={cn(
                'flex items-center gap-1 text-sm font-[family-name:var(--font-barlow-condensed)] font-semibold',
                isLive ? 'text-[var(--accent-hot-500)]' : 'text-[var(--text-primary)]',
              )}
            >
              <Figure value={game.awayScore ?? 0} label={`${game.awayTeam} score`} />
              <span aria-hidden="true">–</span>
              <Figure value={game.homeScore ?? 0} label={`${game.homeTeam} score`} />
            </span>
          ) : (
            <span
              className={cn(
                'flex flex-col items-center gap-0.5',
                'text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]',
              )}
            >
              <span aria-hidden="true">@</span>
              <time dateTime={game.kickoffAt} className="tabular">
                {kickoffLabel(game.kickoffAt, timeZone)}
              </time>
            </span>
          )}

          <LockedTeam
            abbr={game.homeAbbr}
            name={game.homeTeam}
            picked={pickedAbbr === game.homeAbbr}
            isAuto={isAuto}
            align="right"
          />
        </div>

        <span className="absolute right-3 bottom-3 text-[var(--text-tertiary)]">{LOCK_GLYPH}</span>
      </div>
    );
  }

  // --- Picked / Collapsed --------------------------------------------------
  if (pickedAbbr) {
    const opponent = pickedAbbr === game.homeAbbr ? game.awayAbbr : game.homeAbbr;
    return (
      <button
        type="button"
        data-state="picked"
        aria-label={`Change pick — currently ${pickedAbbr} over ${opponent}`}
        onClick={onReopen}
        className={cn(
          // No radius here either, for the same reason as the Locked state
          // above — see that comment.
          'flex min-h-[44px] w-full items-center gap-3 px-4',
          'bg-[var(--bg-surface)] text-left',
          'transition-transform duration-[var(--duration-slow)] ease-[var(--ease-spring)]',
        )}
      >
        <span
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            'bg-[var(--accent-hot-600)] text-[var(--on-accent-hot)]',
            'text-[0.6875rem] font-semibold font-[family-name:var(--font-barlow-condensed)]',
          )}
        >
          {pickedAbbr}
        </span>
        <span className="flex-1">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Picked{isAuto && ' · auto'}
          </span>
          <span className="block text-sm font-[family-name:var(--font-barlow-condensed)] font-semibold text-[var(--text-secondary)]">
            over {opponent}
          </span>
        </span>
        {/* The check confirms the pick; the word underneath is the only
            thing that tells a player the row is still editable. Without it
            the collapsed state reads as final — which is exactly how a
            misclick became permanent. Tertiary weight so it stays a hint,
            not a call to action competing with the pick itself. */}
        <span className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="text-[var(--accent-hot-500)]">{CHECK_GLYPH}</span>
          <span
            aria-hidden="true"
            className="text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]"
          >
            Change
          </span>
        </span>
      </button>
    );
  }

  // --- Unpicked --------------------------------------------------------------
  return (
    <div
      data-state="open"
      // px-4 matches the Locked/Picked states' own horizontal padding so all
      // three states sit flush against the same edges of the single
      // Double-Bezel Pick List container (see PickList.tsx).
      className="grid min-h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2"
    >
      <TeamButton abbr={game.awayAbbr} name={game.awayTeam} onPick={onPick} />

      <span
        className={cn(
          'flex flex-col items-center gap-0.5',
          'text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]',
        )}
      >
        <span aria-hidden="true">@</span>
        <time dateTime={game.kickoffAt} className="tabular">
          {kickoffLabel(game.kickoffAt, timeZone)}
        </time>
      </span>

      <TeamButton abbr={game.homeAbbr} name={game.homeTeam} onPick={onPick} align="right" />
    </div>
  );
}

/** A tappable team target in the Unpicked state (DESIGN.md §7). */
function TeamButton({
  abbr,
  name,
  onPick,
  align = 'left',
}: {
  abbr: string;
  name: string;
  onPick: (abbr: string) => void;
  align?: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={() => onPick(abbr)}
      className={cn(
        'flex min-h-[72px] flex-col justify-center rounded-[var(--radius-md)] px-3 py-2',
        'bg-[var(--bg-elevated)] border border-[var(--border-hairline)]',
        'transition-transform duration-[var(--duration-instant)] ease-[var(--ease-spring)] active:scale-[0.98]',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span className="text-2xl font-[family-name:var(--font-barlow-condensed)] font-semibold leading-[1.1] text-[var(--text-primary)]">
        {abbr}
      </span>
      <span className="text-base font-medium leading-normal text-[var(--text-secondary)]">
        {name}
      </span>
    </button>
  );
}

/**
 * A non-interactive, dimmed team target in the Locked/Live states.
 *
 * DESIGN.md §7 dims both team buttons to 0.55 opacity and drops their text
 * to `--state-locked-fg` once locked; it does not separately specify how the
 * chosen team stays legible against the greyed-out loser, so this reuses the
 * hot-accent "your pick" language already established by the Picked/Collapsed
 * pill rather than inventing new chrome — the picked team's abbreviation
 * keeps `--accent-hot-500`, the other team's abbreviation greys out fully.
 */
function LockedTeam({
  abbr,
  name,
  picked,
  isAuto,
  align = 'left',
}: {
  abbr: string;
  name: string;
  picked: boolean;
  isAuto: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={cn(
        'flex min-h-[72px] flex-col justify-center rounded-[var(--radius-md)] px-3 py-2 opacity-55',
        align === 'right' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        className={cn(
          'text-2xl font-[family-name:var(--font-barlow-condensed)] font-semibold leading-[1.1]',
          picked ? 'text-[var(--accent-hot-500)]' : 'text-[var(--state-locked-fg)]',
        )}
      >
        {abbr}
      </span>
      <span className="text-base font-medium leading-normal text-[var(--state-locked-fg)]">
        {name}
        {picked && isAuto && (
          <span className="ml-1 text-[0.6875rem] font-semibold uppercase tracking-[0.06em]">
            (auto)
          </span>
        )}
      </span>
    </div>
  );
}
