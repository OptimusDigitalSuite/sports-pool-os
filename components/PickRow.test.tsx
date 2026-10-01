import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PickRow } from '@/components/PickRow';

afterEach(cleanup);

const game = {
  id: 'g1',
  homeTeam: 'Minnesota Vikings',
  awayTeam: 'Green Bay Packers',
  homeAbbr: 'MIN',
  awayAbbr: 'GB',
  kickoffAt: '2026-09-20T17:00:00.000Z',
  homeScore: null as number | null,
  awayScore: null as number | null,
  status: 'scheduled' as const,
};

describe('PickRow', () => {
  it('offers both teams as large targets when nothing is picked', () => {
    render(<PickRow timeZone="America/Chicago" game={game} pickedAbbr={null} isAuto={false} locked={false} onPick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Minnesota Vikings/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Green Bay Packers/ })).toBeInTheDocument();
  });

  it('calls onPick with the chosen abbreviation', () => {
    const onPick = vi.fn();
    render(<PickRow timeZone="America/Chicago" game={game} pickedAbbr={null} isAuto={false} locked={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /Minnesota Vikings/ }));
    expect(onPick).toHaveBeenCalledWith('MIN');
  });

  it('reopens the choice instead of re-picking the team already picked', () => {
    const onPick = vi.fn();
    const onReopen = vi.fn();
    render(
      <PickRow timeZone="America/Chicago"
        game={game}
        pickedAbbr="MIN"
        isAuto={false}
        locked={false}
        onPick={onPick}
        onReopen={onReopen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Change pick/ }));
    expect(onReopen).toHaveBeenCalledTimes(1);
    // Re-picking the same team was the old behaviour and made the row a dead
    // tap target: the pick could never be changed before kickoff.
    expect(onPick).not.toHaveBeenCalled();
  });

  it('names the current pick and its opponent in the collapsed row label', () => {
    render(
      <PickRow timeZone="America/Chicago" game={game} pickedAbbr="MIN" isAuto={false} locked={false} onPick={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Change pick — currently MIN over GB' }),
    ).toBeInTheDocument();
  });

  it('collapses to a compact confirmed row once picked', () => {
    const { container } = render(
      <PickRow timeZone="America/Chicago" game={game} pickedAbbr="MIN" isAuto={false} locked={false} onPick={vi.fn()} />,
    );
    expect(container.querySelector('[data-state="picked"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Green Bay Packers/ })).toBeNull();
  });

  it('says so when the pick was filled in automatically', () => {
    render(<PickRow timeZone="America/Chicago" game={game} pickedAbbr="MIN" isAuto locked={false} onPick={vi.fn()} />);
    expect(screen.getByText(/auto/i)).toBeInTheDocument();
  });

  it('greys out and shows the score once locked', () => {
    const live = { ...game, status: 'in_progress' as const, homeScore: 21, awayScore: 17 };
    const { container } = render(
      <PickRow timeZone="America/Chicago" game={live} pickedAbbr="MIN" isAuto={false} locked onPick={vi.fn()} />,
    );
    expect(container.querySelector('[data-state="locked"]')).toBeInTheDocument();
    expect(screen.getByLabelText('Minnesota Vikings score')).toHaveTextContent('21');
  });

  it('does not call onPick when locked', () => {
    const onPick = vi.fn();
    const { container } = render(
      <PickRow timeZone="America/Chicago" game={game} pickedAbbr={null} isAuto={false} locked onPick={onPick} />,
    );
    const target = container.querySelector('button');
    if (target) fireEvent.click(target);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('marks an in-progress game live for the pulse, and a final game not live', () => {
    const live = { ...game, status: 'in_progress' as const, homeScore: 7, awayScore: 3 };
    const { container, rerender } = render(
      <PickRow timeZone="America/Chicago" game={live} pickedAbbr="MIN" isAuto={false} locked onPick={vi.fn()} />,
    );
    expect(container.querySelector('[data-live="true"]')).toBeInTheDocument();

    rerender(
      <PickRow timeZone="America/Chicago"
        game={{ ...live, status: 'final' }}
        pickedAbbr="MIN"
        isAuto={false}
        locked
        onPick={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-live="true"]')).toBeNull();
  });

  // Regression coverage: the LIVE badge used to be positioned `-top-2`
  // (8px above the row's own top edge), which was only safe with the old
  // `space-y-3` gap between rows. Once the Pick List switched to a flush
  // `divide-y` container with zero inter-row gap, that negative offset made
  // the badge hang into the row above it. The badge must now sit fully
  // inside its own row's box — normal document flow, no negative offset.
  it('renders the LIVE badge inside its own row, not hanging above it', () => {
    const live = { ...game, status: 'in_progress' as const, homeScore: 7, awayScore: 3 };
    const { container } = render(
      <PickRow timeZone="America/Chicago" game={live} pickedAbbr="MIN" isAuto={false} locked onPick={vi.fn()} />,
    );
    const badge = screen.getByText('Live');
    expect(badge.className).not.toMatch(/-top-/);
    expect(badge.className).not.toContain('absolute');
    // It renders before the team/score content in the row, i.e. as the
    // row's own leading element (DESIGN.md §7: "at row-start").
    const row = container.querySelector('[data-state="locked"]') as HTMLElement;
    expect(row.firstElementChild).toBe(badge);
  });

  it('never renders a team logo or image', () => {
    const { container } = render(
      <PickRow timeZone="America/Chicago" game={game} pickedAbbr={null} isAuto={false} locked={false} onPick={vi.fn()} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
