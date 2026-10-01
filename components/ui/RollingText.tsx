'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';
import { usePrefersReducedMotion } from '@/lib/ui/usePrefersReducedMotion';

/** duration-base (DESIGN.md §6) — same timing as the standings reorder; this
 * is the other place §6.3/§6.2 name that token for. */
const ROLL_MS = 280;

/**
 * Which character positions differ between two strings of digits (and, for
 * money, the surrounding `$`/`.`), aligned from the right — because a number
 * gains a new leading digit ("9" -> "10"), it never gains one in the middle.
 * A position with no earlier counterpart (the new leading digit) counts as
 * changed too, same as DESIGN.md's odometer treats it.
 */
function changedPositions(previous: string, next: string): Set<number> {
  const prevChars = [...previous];
  const nextChars = [...next];
  const changed = new Set<number>();
  for (let i = 0; i < nextChars.length; i++) {
    const fromEnd = nextChars.length - 1 - i;
    const prevIndex = prevChars.length - 1 - fromEnd;
    if (prevIndex < 0 || nextChars[i] !== prevChars[prevIndex]) changed.add(i);
  }
  return changed;
}

/**
 * The inner text of every Figure (components/ui/Figure.tsx) — DESIGN.md
 * §6.2: a changed score digit rolls vertically rather than swapping, and
 * only the changed digit(s) animate, never a full-row flash.
 *
 * This is the one part of a Figure that has to run on the client: knowing a
 * value "just changed" means comparing this render's text against the
 * previous one, which only means something once you're re-rendering in a
 * browser. Figure itself stays hook-free and server-safe, but every Figure
 * renders this component as a child — so using a Figure always ships this
 * client JS, never zero. Keeping Figure itself hook-free just means it adds
 * no *extra* client cost of its own on top of this leaf, which is kept as
 * small as the requirement allows.
 *
 * On first render, and whenever nothing changed since the last one, this
 * renders the text as a single plain text node — same as a plain <span>
 * would — so the common case (a number that never changes) never sees more
 * than that.
 */
export function RollingText({ text }: { text: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const previous = useRef(text);
  const [changed, setChanged] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (text === previous.current) return;
    const positions = changedPositions(previous.current, text);
    previous.current = text;

    // Reduced motion: DESIGN.md §6.6 — the value changes instantly, no roll.
    if (reducedMotion || positions.size === 0) {
      setChanged(null);
      return;
    }

    setChanged(positions);
    const timer = setTimeout(() => setChanged(null), ROLL_MS);
    return () => clearTimeout(timer);
  }, [text, reducedMotion]);

  if (!changed) return <>{text}</>;

  return (
    <>
      {[...text].map((char, i) => (
        <span
          key={i}
          data-rolling={changed.has(i) ? 'true' : undefined}
          className={cn('inline-block', changed.has(i) && 'animate-figure-roll')}
        >
          {char}
        </span>
      ))}
    </>
  );
}
