'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewer has asked for less motion — the `prefers-reduced-motion`
 * media feature only, nothing else. This is deliberately narrower than
 * `useReducedMotion` (which also folds in save-data/slow-connection signals
 * to decide whether the video backdrop is worth downloading at all): motion
 * sensitivity and bandwidth are different questions, and DESIGN.md §6.6 gates
 * every "collapse to an instant state change" behaviour on this one signal
 * specifically, not on connection quality.
 *
 * Guards against environments with no `matchMedia` at all (some test/embedded
 * environments) rather than throwing — in that case motion is left enabled,
 * same as any other feature-detected capability that simply isn't there.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}
