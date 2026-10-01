'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewer has asked for less motion, when the connection or the
 * device says this is expensive, or when the tab is hidden. Any of those is
 * reason enough to leave the video off — the poster frame carries the design.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;

    const expensive =
      connection?.saveData === true ||
      (connection?.effectiveType !== undefined && /2g/.test(connection.effectiveType));

    const update = () => setReduced(query.matches || expensive);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reduced;
}
