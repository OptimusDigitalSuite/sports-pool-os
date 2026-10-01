'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** DESIGN.md §6.4/§7 — 30s is a reasonable cadence for a leaderboard that
 * isn't a scoreboard: fast enough that "live" stays honest, slow enough not
 * to hammer the server on every open tab. */
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Keeps an otherwise-static Server Component subtree honestly live.
 *
 * `app/p/[token]/standings/page.tsx` is a force-dynamic Server Component
 * with no client-side refresh: it computes `livePulse` once, at request
 * time, and hands it to `StandingsTable`, which then breathes the live-pulse
 * dot (DESIGN.md §6.4) indefinitely over numbers that were frozen the moment
 * the page rendered. Every other liveness gap on this branch is an
 * *absence* a player simply can't see; this one is a *positive claim* — "this
 * is still live" — that the page keeps asserting long after it stops being
 * true.
 *
 * Wrapping the already-server-rendered children here and calling
 * `router.refresh()` on an interval re-runs the Server Component and streams
 * back fresh props (new scores, new `livePulse`, new standings order)
 * without a full reload or remount — so the pulse, and everything under it,
 * stays current for as long as someone is actually looking at the screen.
 *
 * This does NOT animate the standings reorder. `StandingsTable.tsx`'s
 * `view-transition-name`/`-class` per row (DESIGN.md §6.3) is wired and
 * ready, but `router.refresh()` returns `void` — there is no promise or
 * callback that resolves when the new RSC payload actually lands and
 * commits to the DOM. Wrapping the call in `document.startViewTransition`
 * only captures a transition around the synchronous act of *starting* the
 * refresh; the API snapshots "old" and "new" state (and finds them
 * identical) microtasks later, long before the server round trip returns,
 * so it interpolates nothing and the real update then snaps in outside any
 * transition — animating an empty transition on every tick for no visible
 * benefit. Next does not currently expose a signal to transition against
 * here, so the reorder not animating is a known gap, not an oversight; the
 * fix is to call `router.refresh()` directly and not build machinery to
 * force an animation nobody would actually see.
 */
export function AutoRefresh({
  children,
  intervalMs = REFRESH_INTERVAL_MS,
}: {
  children: React.ReactNode;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const refresh = () => router.refresh();

    const start = () => {
      if (id !== null) return;
      id = setInterval(refresh, intervalMs);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };

    // Pause on document.hidden (DESIGN.md-adjacent good citizenship — no
    // point refreshing a tab nobody is looking at) and resume when it comes
    // back into view, rather than polling blind the whole time it's hidden.
    // Also refresh immediately on becoming visible again — without this, a
    // player returning after being backgrounded for 90 minutes would sit on
    // a 90-minute-old render, live-pulse dot breathing over it, until the
    // next tick up to `intervalMs` later: the exact failure this component
    // exists to prevent.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        refresh();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [router, intervalMs]);

  return <>{children}</>;
}
