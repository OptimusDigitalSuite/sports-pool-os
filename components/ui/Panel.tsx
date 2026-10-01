import { cn } from '@/lib/ui/cn';

/**
 * The double-bezel glass surface from DESIGN.md §5: an outer shell (`.glass`
 * — the blurred bezel, 6px padding) around an inner core (`.glass-inner` —
 * the readable surface) that carries the panel's actual content padding.
 * `className` lands on the outer shell, since callers use it for layout
 * concerns (max-width, margin, centering) that belong on the positioned box,
 * not the inset content surface.
 */
export function Panel({
  children,
  className,
  innerClassName,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  /** Extra classes for the inner core — e.g. to drop its padding for a
   * consumer (like the Pick List) that manages its own internal spacing. */
  innerClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass', className)} {...rest}>
      <div className={cn('glass-inner p-5', innerClassName)}>{children}</div>
    </div>
  );
}
