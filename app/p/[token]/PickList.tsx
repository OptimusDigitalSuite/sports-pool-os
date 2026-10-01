'use client';

import { useEffect, useOptimistic, useState, useTransition } from 'react';
import { PickRow, type PickRowGame } from '@/components/PickRow';
import { Panel } from '@/components/ui/Panel';
import { pickAction, setCardLocked, tiebreakAction } from '@/app/p/[token]/actions';

export interface PickListItem {
  game: PickRowGame;
  pickedAbbr: string | null;
  isAuto: boolean;
  locked: boolean;
}

/**
 * The pick list. Every tap saves optimistically — the row collapses instantly
 * and reconciles against the server, because waiting on a round trip before
 * the row moves is what makes an app feel cheap.
 *
 * The 72px→44px spring collapse (DESIGN.md §6.1) can't be one continuous
 * animation inside PickRow, because the unpicked and picked states are
 * different DOM structures — so this parent owns the transition instead,
 * via the View Transitions API. Each row wrapper carries a stable
 * `view-transition-name` keyed by game id; the browser interpolates between
 * whatever that row looked like before and after the optimistic update. It
 * also carries `view-transition-class="pick"` — a static class shared by
 * every row, since the per-row names are dynamic and
 * `::view-transition-group()` can't select them by prefix — so the timing
 * (duration-slow/ease-spring) in app/globals.css can target
 * `::view-transition-group(.pick)` specifically, without also catching the
 * standings reorder's own (different) timing.
 */
export function PickList({
  token,
  weekId,
  items,
  initialGuess,
  timeZone,
  initialLocked,
  lockAvailable,
}: {
  token: string;
  weekId: string;
  items: PickListItem[];
  initialGuess: number | null;
  /** The pool's zone, so every kickoff reads the same on server and phone. */
  timeZone: string;
  /** The player's own lock on this card, independent of the week deadline. */
  initialLocked: boolean;
  /** False until migration 0006 lands; the control hides rather than throws. */
  lockAvailable: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, addOptimistic] = useOptimistic(
    items,
    (state: PickListItem[], next: { gameId: string; abbr: string }) =>
      state.map((item) =>
        item.game.id === next.gameId ? { ...item, pickedAbbr: next.abbr, isAuto: false } : item,
      ),
  );
  const [guess, setGuess] = useState(initialGuess);
  const [cardLocked, setCardLocked_] = useState(initialLocked);
  const [tiebreakSaved, setTiebreakSaved] = useState(false);
  // Which already-picked row is reopened for editing. Exactly one at a time:
  // reopening a second row closes the first, so the list never drifts back
  // toward sixteen expanded rows, which is the whole point of the collapse.
  const [editingGameId, setEditingGameId] = useState<string | null>(null);

  // "Saved" is a confirmation, not a permanent status — it should clear on
  // its own rather than sit there until the player happens to refocus the
  // field, which is what let it linger forever before this.
  useEffect(() => {
    if (!tiebreakSaved) return;
    const id = setTimeout(() => setTiebreakSaved(false), 3000);
    return () => clearTimeout(id);
  }, [tiebreakSaved]);

  // Wraps the optimistic state update in a view transition when the browser
  // supports it, so the row's DOM swap (button pair -> collapsed pill) is
  // captured and animated rather than snapping. Feature-detected, not
  // assumed: Safari and older browsers fall through to a plain update.
  const withViewTransition = (update: () => void) => {
    const startViewTransition = (
      document as Document & { startViewTransition?: (cb: () => void) => void }
    ).startViewTransition?.bind(document);
    if (startViewTransition) startViewTransition(update);
    else update();
  };

  const pick = (gameId: string) => (abbr: string) => {
    setError(null);
    startTransition(async () => {
      withViewTransition(() => {
        addOptimistic({ gameId, abbr });
        // Collapse the row again on the way out, so choosing a team is what
        // closes the editor rather than leaving it open behind the result.
        setEditingGameId(null);
      });
      const result = await pickAction(token, gameId, abbr);
      if (!result.ok) setError(result.reason);
    });
  };

  // Reopening runs through the same transition as picking, so the row
  // expands back to the two-team chooser rather than snapping open.
  const reopen = (gameId: string) => () => {
    setError(null);
    withViewTransition(() => setEditingGameId(gameId));
  };

  const total = optimistic.length;
  const pickedCount = optimistic.filter((i) => i.pickedAbbr).length;
  const remaining = optimistic.filter((i) => !i.pickedAbbr && !i.locked).length;
  // Auto-pick refuses to enter a player who never joined the week, so a
  // player who tapped nothing before everything locked has zero picks —
  // "All picks in" would be a flat lie for them, not a celebration.
  const missedWeek = total > 0 && optimistic.every((i) => i.locked) && pickedCount === 0;
  // `missedWeek` only catches a *complete* miss (zero picks). A player who
  // picked some games and let the rest lock without picking is neither a
  // full miss nor "all picks in" — `remaining` (open, unlocked, unpicked
  // games) is 0 either way, so without this check the message would lie
  // and call a 3-of-16 week "All picks in."
  const partialMiss = total > 0 && !missedWeek && remaining === 0 && pickedCount < total;

  return (
    <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
      {/* Secondary, not tertiary: this is the only text on the screen sitting
          directly on the video wash rather than inside a glass panel, and
          tertiary measured under 4.5:1 against it (DESIGN.md §5, state 2). */}
      <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
        {missedWeek
          ? "You didn't get picks in this week."
          : partialMiss
            ? `${pickedCount} of ${total} picked`
            : remaining === 0
              ? 'All picks in.'
              : `${remaining} left`}
      </p>

      {error && (
        <p role="alert" className="text-sm text-[var(--text-secondary)]">
          {error}
        </p>
      )}

      {/* DESIGN.md §5/§7/§8: the entire Pick List is ONE Double-Bezel
          container — rows are separated by a --border-hairline top-divider,
          never their own card chrome (radius + fill + gap), which §8 lists
          under "Banned outright" as "Per-row card chrome in the Pick List".
          `divide-y` supplies exactly that divider, between rows only (never
          before the first or after the last) — the opposite of the
          `space-y-3` this used to render each row inside its own visually
          separate block. innerClassName drops the Panel's default p-5
          content padding (verified as actually dropped, not just
          overridden-in-source-order, by lib/ui/cn.ts's Tailwind-merge — see
          PickList.test.tsx) because each row already carries its own
          horizontal padding (see PickRow.tsx) that needs to reach flush to
          this container's edges, divider included. The per-row wrapper
          below carries `py-1` — DESIGN.md §4's 8px vertical rhythm between
          Pick List rows (4px top + 4px bottom, split across the shared
          hairline divider) — so the divider still separates rows without
          rows touching edge-to-edge. */}
      {optimistic.length > 0 && (
        <Panel
          className="mt-3"
          innerClassName="divide-y divide-[var(--border-hairline)] p-0"
          data-testid="pick-rows"
        >
          {optimistic.map((item) => (
            <div
              key={item.game.id}
              className="py-1"
              style={{ viewTransitionName: `pick-${item.game.id}`, viewTransitionClass: 'pick' }}
            >
              {/* A row being edited renders as the unpicked chooser — same
                  two targets, same collapse on choosing. A locked row is
                  never editable, so the lock always wins over the editor. */}
              <PickRow
            timeZone={timeZone}
                game={item.game}
                pickedAbbr={
                  editingGameId === item.game.id && !item.locked ? null : item.pickedAbbr
                }
                isAuto={item.isAuto}
                locked={item.locked}
                onPick={pick(item.game.id)}
                onReopen={reopen(item.game.id)}
              />
            </div>
          ))}
        </Panel>
      )}

      <Panel className="mt-6">
        <label htmlFor="tiebreak" className="block text-sm text-[var(--text-secondary)]">
          Combined score, last game of the week
        </label>
        <input
          id="tiebreak"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={guess ?? undefined}
          disabled={pending}
          onFocus={() => setTiebreakSaved(false)}
          // A mouse wheel over a focused number input increments/decrements
          // it in most browsers — scrolling the page while this field
          // happens to have focus can silently turn an empty value into "1"
          // and then submit it on blur. Blurring on wheel makes that
          // physically impossible instead of trying to out-guess it.
          onWheel={(event) => event.currentTarget.blur()}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            // An empty field is "I haven't decided", not a guess of zero.
            // Submitting here would call entries.ensure and put this player
            // on the hook for the buy-in without them choosing to enter.
            if (raw === '') return;
            const value = Number(raw);
            if (!Number.isInteger(value) || value < 0) return;
            if (value === guess) return;
            startTransition(async () => {
              try {
                const result = await tiebreakAction(token, weekId, value);
                if (result.ok) {
                  // Record only after the server confirms, so a failed save
                  // can be retried with the same number.
                  setGuess(value);
                  setTiebreakSaved(true);
                } else {
                  setError(result.reason);
                }
              } catch {
                setError('Could not save that — try again.');
              }
            });
          }}
          className="tabular mt-2 w-full rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-4 py-3 text-2xl"
        />
        {/* Mounted up front, empty, rather than only once there is
            something to say — many screen readers only announce a CHANGE
            to an aria-live region that already existed at mount, not a
            region that appears for the first time with its text already
            in it. */}
        <p aria-live="polite" className="mt-1 text-xs text-[var(--text-tertiary)]">
          {tiebreakSaved ? 'Saved' : ''}
        </p>
      </Panel>

      {lockAvailable && (
      <Panel>
        <h2 className="mb-1 font-[family-name:var(--font-barlow-condensed)] text-xl">
          {cardLocked ? 'Your card is locked' : 'Done picking?'}
        </h2>
        <p className="mb-3 text-sm text-[var(--text-tertiary)]">
          {cardLocked
            ? 'Nothing on this screen can change your picks until you unlock it. Your phone can sit in a pocket.'
            : 'Lock your card so a stray tap cannot change it. You can unlock any time before the deadline.'}
        </p>
        <button
          type="button"
          onClick={() => {
            startTransition(async () => {
              const next = !cardLocked;
              const result = await setCardLocked(token, next);
              if (result.ok) {
                setCardLocked_(next);
                setError(null);
              } else {
                setError(result.reason);
              }
            });
          }}
          className="w-full rounded-[var(--radius-md)] bg-[var(--bg-surface)] px-4 py-3 font-semibold"
        >
          {cardLocked ? 'Unlock my card' : 'Lock my card'}
        </button>
      </Panel>
      )}
    </div>
  );
}
