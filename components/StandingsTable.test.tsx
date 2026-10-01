import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StandingsTable } from '@/components/StandingsTable';

afterEach(cleanup);

const rows = [
  { playerId: 'p1', name: 'Bill', correct: 11, incorrect: 2, voided: 0, stillAlive: 3, predictedTotal: 47, tiebreakDelta: null, rank: 1 },
  { playerId: 'p2', name: 'Kenneth', correct: 9, incorrect: 4, voided: 0, stillAlive: 3, predictedTotal: 51, tiebreakDelta: null, rank: 2 },
];

describe('StandingsTable', () => {
  it('lists players in finishing order', () => {
    render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    const names = screen.getAllByTestId('standing-name').map((n) => n.textContent);
    expect(names).toEqual(['Bill', 'Kenneth']);
  });

  it('shows how much is still winnable', () => {
    render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    expect(screen.getAllByLabelText('still alive')[0]).toHaveTextContent('3');
  });

  it('hides the tiebreak column until the last game has kicked off', () => {
    render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    expect(screen.queryByText(/tiebreak/i)).toBeNull();
  });

  it('shows the tiebreak column once the last game has kicked off — even before it is final', () => {
    // DESIGN.md §7: the column appears on kickoff, not on settlement — the
    // rows below have no tiebreakDelta (only turns non-null once the game
    // is final), which is exactly the in-progress case this guards.
    render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted />);
    expect(screen.getByText(/tiebreak/i)).toBeInTheDocument();
  });

  it('shows the guess itself ("tiebreak: 47" in DESIGN.md\'s own example), not the delta from the real total', () => {
    render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted />);
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('51')).toBeInTheDocument();
  });

  it('renders the pot in money styling, never the live accent', () => {
    const { container } = render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    const pot = container.querySelector('[data-testid="pot"]')!;
    expect(pot.className).toContain('--money-amber');
    expect(pot.className).not.toContain('--accent-hot');
  });

  it('gives each row a stable view-transition name so reorders animate', () => {
    const { container } = render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    const row = container.querySelector('[data-player-id="p1"]') as HTMLElement;
    expect(row.style.viewTransitionName).toBe('standing-p1');
  });

  it('tags each row with the "standing" view-transition-class so its own duration-base timing applies, never the pick collapse\'s', () => {
    const { container } = render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    const row = container.querySelector('[data-player-id="p1"]') as HTMLElement;
    expect(row.style.viewTransitionClass).toBe('standing');
  });

  it('gives the viewer\'s own row the left-rule treatment and leaves other rows untouched', () => {
    const { container } = render(
      <StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} viewerId="p1" />,
    );
    const viewerRow = container.querySelector('[data-player-id="p1"]') as HTMLElement;
    const otherRow = container.querySelector('[data-player-id="p2"]') as HTMLElement;
    expect(viewerRow.className).toContain('border-l-[var(--accent-hot-500)]');
    expect(viewerRow.className).not.toContain('border-l-transparent');
    expect(otherRow.className).toContain('border-l-transparent');
    expect(otherRow.className).not.toContain('border-l-[var(--accent-hot-500)]');
  });

  it('shows no left-rule on any row when there is no viewer', () => {
    const { container } = render(<StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} />);
    for (const id of ['p1', 'p2']) {
      const row = container.querySelector(`[data-player-id="${id}"]`) as HTMLElement;
      expect(row.className).toContain('border-l-transparent');
    }
  });

  it('shows the still-alive pulse dot when livePulse is true', () => {
    const { container } = render(
      <StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} livePulse />,
    );
    expect(container.querySelectorAll('[data-live="true"]').length).toBe(rows.length);
  });

  it('shows no pulse dot when livePulse is false', () => {
    const { container } = render(
      <StandingsTable rows={rows} potCents={2000} tiebreakStarted={false} livePulse={false} />,
    );
    expect(container.querySelectorAll('[data-live="true"]').length).toBe(0);
  });
});
