import { cn } from '@/lib/ui/cn';

export interface PaidLine {
  playerId: string;
  name: string;
  paid: boolean;
  owedCents: number;
  payLink: string | null;
}

const CHECK_GLYPH = (
  <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden="true">
    <path
      d="M3 8.5 6.5 12 13 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Who has settled up and who has not (DESIGN.md §7 "Paid / Unpaid Chip").
 *
 * Deliberately plain — this is a ledger, and DESIGN.md §8 bans confetti,
 * glow, or any celebratory motion here. Paying your $10 is not a win, so
 * nothing in this file animates.
 */
export function PaidStrip({ lines }: { lines: PaidLine[] }) {
  return (
    <ul className="mx-auto mt-4 flex w-full max-w-[560px] flex-wrap gap-2 px-4">
      {lines.map((line) => (
        <li
          key={line.playerId}
          data-testid={`chip-${line.playerId}`}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-xs',
            line.paid
              ? 'bg-[var(--money-amber-600)] text-[var(--on-money)]'
              : 'border border-[var(--money-amber-500)] text-[var(--money-amber-500)]',
          )}
        >
          {line.paid && <span aria-hidden="true">{CHECK_GLYPH}</span>}
          <span>{line.name}</span>
          <span className="tabular">
            {line.paid ? 'paid' : `owes $${(line.owedCents / 100).toFixed(2)}`}
          </span>
          {!line.paid && line.payLink && (
            <a
              href={line.payLink}
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="underline underline-offset-2"
              aria-label={`Pay ${line.name}'s share`}
            >
              pay
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
