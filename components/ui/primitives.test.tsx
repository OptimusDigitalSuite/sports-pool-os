import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Figure } from '@/components/ui/Figure';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';

afterEach(cleanup);

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('Figure', () => {
  it('renders the value with tabular numerals so digits never reflow', () => {
    render(<Figure value={27} label="score" />);
    const el = screen.getByText('27');
    expect(el.className).toContain('tabular');
  });

  it('formats cents as dollars when told to', () => {
    render(<Figure value={2000} format="money" label="pot" />);
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('exposes an accessible label for screen readers', () => {
    render(<Figure value={11} label="correct picks" />);
    expect(screen.getByLabelText('correct picks')).toBeInTheDocument();
  });

  it('names itself with role="img" so aria-label actually reaches assistive tech', () => {
    // A bare <span> has the implicit ARIA role "generic", and the "generic"
    // role's naming-prohibited rule means aria-label on it is invisible to
    // screen readers — this asserts Figure uses a role that accepts a name.
    render(<Figure value={11} label="correct picks" />);
    expect(screen.getByRole('img', { name: 'correct picks' })).toBeInTheDocument();
  });

  it('renders correctly on first paint with no digit-roll treatment (DESIGN.md §6.2)', () => {
    mockMatchMedia(false);
    const { container } = render(<Figure value={27} label="score" />);
    expect(screen.getByLabelText('score')).toHaveTextContent('27');
    expect(container.querySelector('[data-rolling="true"]')).toBeNull();
  });

  it('rolls only the changed digit(s) when a live value changes', () => {
    mockMatchMedia(false);
    const { rerender, container } = render(<Figure value={27} label="score" />);
    rerender(<Figure value={28} label="score" />);
    expect(screen.getByLabelText('score')).toHaveTextContent('28');
    expect(container.querySelector('[data-rolling="true"]')).not.toBeNull();
    // Only the "8" changed from "7" — the "2" did not, so it never rolls.
    const rolling = [...container.querySelectorAll('[data-rolling="true"]')].map((n) => n.textContent);
    expect(rolling).toEqual(['8']);
  });

  it('changes the value instantly, with no digit-roll treatment, under prefers-reduced-motion', () => {
    mockMatchMedia(true);
    const { rerender, container } = render(<Figure value={27} label="score" />);
    rerender(<Figure value={28} label="score" />);
    expect(screen.getByLabelText('score')).toHaveTextContent('28');
    expect(container.querySelector('[data-rolling="true"]')).toBeNull();
  });
});

describe('Panel', () => {
  it('applies the double-bezel glass recipe: an outer shell around an inner core', () => {
    const { container } = render(<Panel>content</Panel>);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('glass');

    const inner = shell.firstElementChild as HTMLElement;
    expect(inner.className).toContain('glass-inner');
    // Content lives inside the inner core, not directly on the bezel shell.
    expect(inner.textContent).toBe('content');
  });

  it('puts the panel\'s content padding on the inner core, not the bezel shell', () => {
    const { container } = render(<Panel>content</Panel>);
    const shell = container.firstElementChild as HTMLElement;
    const inner = shell.firstElementChild as HTMLElement;
    expect(inner.className).toContain('p-5');
  });
});

describe('Button', () => {
  it('fills with the hot accent for the primary action', () => {
    const { container } = render(<Button variant="primary">Pick</Button>);
    expect(container.firstElementChild?.className).toContain('--accent-hot-600');
  });

  it('fills with money amber for a payout action', () => {
    const { container } = render(<Button variant="money">Mark paid</Button>);
    expect(container.firstElementChild?.className).toContain('--money-amber-600');
  });

  it('gives a destructive action no colour at all', () => {
    const { container } = render(<Button variant="destructive">Remove player</Button>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).not.toContain('--accent-hot');
    expect(className).not.toContain('--money-amber');
    // DESIGN.md §2: destructive actions render as a low-emphasis ghost —
    // --text-tertiary label, --border-hairline hairline. --text-muted and
    // --border-subtle are not real tokens in app/globals.css.
    expect(className).toContain('--text-tertiary');
  });

  it('meets the 44px minimum touch target — 48px on mobile, 52px on desktop per DESIGN.md §7', () => {
    const { container } = render(<Button variant="primary">Pick</Button>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('min-h-[48px]');
    expect(className).toContain('md:min-h-[52px]');
  });

  it('renders as a pill (DESIGN.md §7: border-radius 9999px), not radius-md', () => {
    const { container } = render(<Button variant="primary">Pick</Button>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('rounded-full');
    expect(className).not.toContain('radius-md');
  });

  it('gives the disabled state its own styling so it reads differently from idle', () => {
    const { container } = render(
      <Button variant="primary" disabled>
        Add player
      </Button>
    );
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('disabled:opacity-40');
    expect(className).toContain('disabled:bg-[var(--bg-elevated)]');
    expect(className).toContain('disabled:text-[var(--text-tertiary)]');
  });

  it('animates only transform and opacity, never background-color (DESIGN.md §8)', () => {
    const { container } = render(<Button variant="primary">Pick</Button>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).toContain('transition-[transform,opacity]');
    expect(className).not.toContain('background-color');
  });

  it('still swaps the destructive variant colourless when pressed', () => {
    const { container } = render(<Button variant="destructive">Remove player</Button>);
    const className = container.firstElementChild?.className ?? '';
    expect(className).not.toContain('--accent-hot');
    expect(className).not.toContain('--money-amber');
  });
});
