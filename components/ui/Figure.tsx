import { cn } from '@/lib/ui/cn';
import { RollingText } from '@/components/ui/RollingText';

/**
 * Any number that can change while someone is looking at it.
 *
 * Tabular numerals are not decoration here: a score going 7 → 10 or a pot
 * going $90 → $100 must not shift the layout around it (DESIGN.md §3).
 *
 * Figure's own function body is plain and hook-free — no client JS of its
 * *own* — but it always renders RollingText (components/ui/RollingText.tsx)
 * as a child, and that component is a client component (`'use client'`, its
 * own hooks). So *using* Figure is never actually zero-JS: the digit-roll on
 * change (DESIGN.md §6.2) genuinely has to run on the client, and it ships
 * every time a Figure does. What staying hook-free buys Figure is only that
 * it can be *authored* as a Server Component and doesn't add hydration cost
 * of its own on top of RollingText's — see that file's comment for the rest.
 */
export function Figure({
  value,
  label,
  format = 'plain',
  className,
}: {
  value: number;
  label: string;
  format?: 'plain' | 'money';
  className?: string;
}) {
  const text = format === 'money' ? `$${(value / 100).toFixed(2)}` : String(value);
  return (
    // `role="img"` is load-bearing, not decorative: a bare <span> has the
    // implicit ARIA role "generic", and the generic role's "prohibited"
    // naming rule means assistive tech ignores `aria-label` entirely on it
    // (the WAI-ARIA "Accessible Name and Description" spec forbids naming a
    // generic element). `role="img"` is one of the roles that *does* accept
    // an accessible name, the same pattern as an `<img alt="...">` — the
    // label reaches screen readers as one unit ("score, 27"), rather than
    // being silently dropped.
    <span
      role="img"
      aria-label={label}
      className={cn('tabular font-[family-name:var(--font-barlow-condensed)]', className)}
    >
      <RollingText text={text} />
    </span>
  );
}
