import type { WeekStatus } from '@/lib/db/types';

/**
 * The commissioner's override on top of the automatic deadline.
 *
 * `null` means "follow the clock" — the normal state for every week.
 */
export type LockOverride = 'locked' | 'open' | null;

export interface WeekLockInput {
  status: WeekStatus;
  lockOverride: LockOverride;
  /** Every game in the week, as raw kickoff timestamps. */
  kickoffs: readonly string[];
  now: Date;
}

/**
 * When the week's picks close: the earliest readable kickoff in it.
 *
 * Returns null when no kickoff can be read at all — a week with no schedule
 * yet, or one whose every timestamp is malformed. Callers treat that as
 * locked, never as open (see `isWeekLocked`).
 *
 * Unreadable timestamps are skipped rather than fatal: one bad row out of
 * sixteen should not decide the deadline for the other fifteen, and the
 * per-game guard in submitPick still refuses to write a pick against it.
 */
export function weekLockAtMs(kickoffs: readonly string[]): number | null {
  let earliest: number | null = null;
  for (const kickoff of kickoffs) {
    const ms = Date.parse(kickoff);
    if (Number.isNaN(ms)) continue;
    if (earliest === null || ms < earliest) earliest = ms;
  }
  return earliest;
}

/**
 * Whether the whole week is closed to picks and tiebreak guesses.
 *
 * The pool runs one deadline for the entire entry — the week's first kickoff —
 * rather than locking each game at its own. Two consequences worth stating,
 * because both are deliberate:
 *
 * - Sunday games are not pickable on Sunday. Everyone commits before anyone
 *   has seen a snap, which is the whole point of a single deadline.
 * - The tiebreak guess closes then too, not at the Monday night kickoff it
 *   describes. Otherwise a player could watch the week play out and only then
 *   decide what number they needed.
 *
 * Precedence: a frozen week is closed no matter what, then the commissioner's
 * override, then the clock. Failing closed on an unknown deadline is the money
 * path — an open week whose deadline cannot be read would accept picks against
 * results that are already known.
 */
export function isWeekLocked(input: WeekLockInput): boolean {
  if (input.status === 'frozen') return true;
  if (input.lockOverride === 'locked') return true;
  if (input.lockOverride === 'open') return false;

  const lockAt = weekLockAtMs(input.kickoffs);
  if (lockAt === null) return true;
  return input.now.getTime() >= lockAt;
}
