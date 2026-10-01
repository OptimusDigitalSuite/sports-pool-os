import { cn } from '@/lib/ui/cn';

export type ButtonVariant = 'primary' | 'money' | 'ghost' | 'destructive';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-hot-600)] text-[var(--on-accent-hot)] active:bg-[var(--accent-hot-700)]',
  money:
    'bg-[var(--money-amber-600)] text-[var(--on-money)] active:bg-[var(--money-amber-700)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] border border-[var(--border-hairline)]',
  // Deliberately colourless (DESIGN.md §2). A delete must read quieter than
  // the safe action, and must never wear the colour that means "live" or
  // "won" — --text-tertiary label, --border-hairline hairline, no glow.
  destructive:
    'bg-transparent text-[var(--text-tertiary)] border border-[var(--border-hairline)]',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cn(
        // DESIGN.md §7 Primary Button: pill (`border-radius: 9999px`), 52px
        // desktop / 48px mobile (both clear the 44px touch-target minimum).
        // `rounded-full` on Tailwind's own spacing scale computes to
        // 3.4e38px — effectively 9999px for any button-sized box.
        'min-h-[48px] rounded-full px-5 font-medium md:min-h-[52px]',
        // DESIGN.md §8 bans animating anything other than transform/opacity
        // (background-color forces paint on every frame). The active-state
        // fill swap below still gives a press response — it just applies
        // instantly instead of transitioning, since it isn't in this list.
        'transition-[transform,opacity] duration-[var(--duration-fast)]',
        'active:scale-[0.98]',
        // DESIGN.md §7 Button, Disabled: opacity 0.4, background
        // --bg-elevated, text --text-tertiary, no interaction. Without this,
        // a disabled button (AddPlayerForm's pending state, for example)
        // rendered pixel-identical to an idle, tappable one.
        'disabled:pointer-events-none disabled:bg-[var(--bg-elevated)] disabled:text-[var(--text-tertiary)] disabled:opacity-40',
        VARIANT[variant],
        className,
      )}
    />
  );
}
