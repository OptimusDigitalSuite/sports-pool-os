import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { PickList, type PickListItem } from '@/app/p/[token]/PickList';
import { pickAction, tiebreakAction } from '@/app/p/[token]/actions';

vi.mock('@/app/p/[token]/actions', () => ({
  pickAction: vi.fn(),
  tiebreakAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items: PickListItem[] = [];

function renderList(initialGuess: number | null = null) {
  return render(
    <PickList lockAvailable={false} initialLocked={false} timeZone="America/Chicago" token="tok" weekId="week-1" items={items} initialGuess={initialGuess} />,
  );
}

function gameItem(
  id: string,
  overrides: Partial<Pick<PickListItem, 'pickedAbbr' | 'isAuto' | 'locked'>> = {},
): PickListItem {
  return {
    game: {
      id,
      homeTeam: 'Minnesota Vikings',
      awayTeam: 'Green Bay Packers',
      homeAbbr: 'MIN',
      awayAbbr: 'GB',
      kickoffAt: '2026-09-20T17:00:00.000Z',
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
    },
    pickedAbbr: null,
    isAuto: false,
    locked: false,
    ...overrides,
  };
}

function renderWithItems(listItems: PickListItem[], initialGuess: number | null = null) {
  return render(
    <PickList lockAvailable={false} initialLocked={false} timeZone="America/Chicago" token="tok" weekId="week-1" items={listItems} initialGuess={initialGuess} />,
  );
}

describe('PickList tiebreak field', () => {
  it('submits nothing when the field is blurred empty', async () => {
    renderList(null);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).not.toHaveBeenCalled());
  });

  it('submits nothing when the field is blurred with only whitespace', async () => {
    renderList(null);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).not.toHaveBeenCalled());
  });

  it('submits nothing when the value is unchanged from the initial guess', async () => {
    renderList(45);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).not.toHaveBeenCalled());
  });

  it('submits once when the value actually changes', async () => {
    vi.mocked(tiebreakAction).mockResolvedValue({ ok: true });
    renderList(45);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.change(input, { target: { value: '51' } });
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).toHaveBeenCalledTimes(1));
    expect(tiebreakAction).toHaveBeenCalledWith('tok', 'week-1', 51);
  });

  it('retries with the same number after a failed save, since the value is only recorded on success', async () => {
    vi.mocked(tiebreakAction).mockResolvedValue({ ok: false, reason: 'Could not save.' });
    renderList(45);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.change(input, { target: { value: '51' } });
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).toHaveBeenCalledTimes(1));

    // Re-focus and re-blur with the SAME number. A naive "record the guess
    // before the server confirms" implementation would see this as a no-op
    // (value === guess) and never call the server again — trapping the
    // player unable to retry without first entering a different number.
    fireEvent.focus(input);
    fireEvent.blur(input);
    await waitFor(() => expect(tiebreakAction).toHaveBeenCalledTimes(2));
    expect(tiebreakAction).toHaveBeenLastCalledWith('tok', 'week-1', 51);
  });

  it('surfaces a thrown error from a failed save instead of losing it silently', async () => {
    vi.mocked(tiebreakAction).mockRejectedValue(new Error('network down'));
    renderList(45);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.change(input, { target: { value: '51' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('shows a saved confirmation after a real change is submitted', async () => {
    vi.mocked(tiebreakAction).mockResolvedValue({ ok: true });
    renderList(45);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.change(input, { target: { value: '51' } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
  });

  it('does not show a saved confirmation for an empty blur', async () => {
    renderList(null);
    const input = screen.getByLabelText(/combined score/i);
    fireEvent.blur(input);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/saved/i)).toBeNull();
  });

  // Many screen readers only announce a CHANGE to an aria-live region that
  // already existed at mount — a region that appears for the first time
  // with its text already present is easy to miss entirely.
  it('mounts the "Saved" live region up front, empty, rather than only once there is something to say', () => {
    const { container } = renderList(null);
    const liveRegion = container.querySelector('p[aria-live="polite"].mt-1');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent('');
  });

  it('clears the saved confirmation on a timer, rather than leaving it forever', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(tiebreakAction).mockResolvedValue({ ok: true });
      renderList(45);
      const input = screen.getByLabelText(/combined score/i);
      fireEvent.change(input, { target: { value: '51' } });
      fireEvent.blur(input);

      // Flush the already-resolved mock promise (a microtask, unaffected by
      // fake timers) so "Saved" actually appears before advancing the clock.
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText(/saved/i)).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(screen.queryByText(/saved/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // A mouse wheel over a focused type="number" input increments/decrements
  // its value in most browsers — scrolling the page while the tiebreak
  // field happens to have focus can silently turn an empty field into "1"
  // and then submit it on blur, putting the player on the hook for the
  // buy-in (entries.ensure) without them ever choosing a number.
  it('blurs the field on wheel so a scroll cannot silently change or submit the value', () => {
    renderList(null);
    const input = screen.getByLabelText(/combined score/i);
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.wheel(input);
    expect(document.activeElement).not.toBe(input);
  });
});

describe('PickList status message', () => {
  it('says a game is left when one remains unpicked and unlocked', () => {
    renderWithItems([gameItem('g1', { locked: false, pickedAbbr: null })]);
    expect(screen.getByText(/1 left/i)).toBeInTheDocument();
  });

  it('says all picks are in when every game is picked', () => {
    renderWithItems([
      gameItem('g1', { pickedAbbr: 'MIN', locked: true }),
      gameItem('g2', { pickedAbbr: 'GB', locked: false }),
    ]);
    expect(screen.getByText(/all picks in/i)).toBeInTheDocument();
  });

  it('says the player missed the week when nothing was picked and everything is locked', () => {
    renderWithItems([
      gameItem('g1', { pickedAbbr: null, locked: true }),
      gameItem('g2', { pickedAbbr: null, locked: true }),
    ]);
    expect(screen.getByText(/didn.t get picks in this week/i)).toBeInTheDocument();
    expect(screen.queryByText(/all picks in/i)).toBeNull();
  });

  // A player who picked some games and then let the rest lock without
  // picking is neither "all picks in" (a lie — some games have no pick) nor
  // a full miss (they did pick some). Report the real count instead.
  it('reports the real count for a partial week — some picked, the rest locked with no pick', () => {
    renderWithItems([
      gameItem('g1', { pickedAbbr: 'MIN', locked: true }),
      gameItem('g2', { pickedAbbr: 'GB', locked: true }),
      gameItem('g3', { pickedAbbr: null, locked: true }),
    ]);
    expect(screen.getByText(/2 of 3 picked/i)).toBeInTheDocument();
    expect(screen.queryByText(/all picks in/i)).toBeNull();
    expect(screen.queryByText(/didn.t get picks in this week/i)).toBeNull();
  });
});

// DESIGN.md §8 bans "per-row card chrome in the Pick List" outright — the
// whole list is one Double-Bezel container (§5/§7), rows separated only by
// a --border-hairline divider. A per-task review of PickRow in isolation
// can't catch this: PickRow renders correctly on its own either way: the
// composition bug lives here, in how PickList assembles many rows.
describe('PickList composition (DESIGN.md §5/§7/§8)', () => {
  it('renders the pick rows inside a single glass container, not one per row', () => {
    const { container } = renderWithItems([gameItem('g1'), gameItem('g2'), gameItem('g3')]);
    const glassPanels = container.querySelectorAll('[data-testid="pick-rows"].glass');
    expect(glassPanels.length).toBe(1);
    // All three rows live inside that one container.
    expect(glassPanels[0]!.querySelectorAll('[data-state]').length).toBe(3);
  });

  it('separates rows with hairline dividers, not gaps between separate cards', () => {
    const { container } = renderWithItems([gameItem('g1'), gameItem('g2')]);
    const rowList = container.querySelector('[data-testid="pick-rows"] .glass-inner')!;
    expect(rowList.className).toContain('divide-y');
    expect(rowList.className).not.toContain('space-y');
  });

  // Regression coverage for the actual bug, not just the literal string
  // passed to `cn` — a naive class-join left the Panel's default `p-5`
  // content padding sitting right alongside the `p-0` override in the same
  // class list, and which one won was decided by source order in the built
  // stylesheet, not by which one was passed later. This asserts the
  // resolved class list itself has no `p-5`, so the rows actually sit flush
  // against the container's edges.
  it('drops the Panel default padding on the inner core, so rows sit flush against the container edges', () => {
    const { container } = renderWithItems([gameItem('g1'), gameItem('g2')]);
    const rowList = container.querySelector('[data-testid="pick-rows"] .glass-inner')!;
    expect(rowList.className).not.toContain('p-5');
  });

  // DESIGN.md §4: "Pick List rows: space-2 (8px) vertical rhythm between
  // rows." The zero-gap `divide-y` container above satisfies "flush edges
  // and hairline dividers, not per-row cards" but on its own gives rows NO
  // vertical rhythm at all — each row's wrapper needs its own py-1 (4px top
  // + 4px bottom = 8px between adjacent rows) to restore it.
  it('gives each row wrapper 8px of vertical rhythm (DESIGN.md §4), on top of the hairline divider', () => {
    const { container } = renderWithItems([gameItem('g1'), gameItem('g2')]);
    const wrappers = container.querySelectorAll('[data-testid="pick-rows"] .glass-inner > *');
    expect(wrappers.length).toBe(2);
    for (const wrapper of wrappers) {
      expect((wrapper as HTMLElement).className).toContain('py-1');
    }
  });
});

describe('PickList changing a pick', () => {
  it('reopens the chooser and saves the other team', async () => {
    vi.mocked(pickAction).mockResolvedValue({ ok: true });
    renderWithItems([gameItem('g1', { pickedAbbr: 'MIN', locked: false })]);

    // Collapsed to a single row that advertises itself as changeable.
    const collapsed = screen.getByRole('button', { name: /Change pick/ });
    await act(async () => {
      fireEvent.click(collapsed);
    });

    // Both teams are targets again.
    const other = screen.getByRole('button', { name: /Green Bay Packers/ });
    await act(async () => {
      fireEvent.click(other);
    });

    await waitFor(() => {
      expect(pickAction).toHaveBeenCalledWith('tok', 'g1', 'GB');
    });
    // And it collapses again rather than staying open behind the result.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Change pick/ })).toBeInTheDocument();
    });
  });

  it('refuses to reopen a locked row', async () => {
    renderWithItems([gameItem('g1', { pickedAbbr: 'MIN', locked: true })]);
    expect(screen.queryByRole('button', { name: /Change pick/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Green Bay Packers/ })).toBeNull();
  });

  it('keeps the remaining count unchanged while a row is being edited', async () => {
    renderWithItems([
      gameItem('g1', { pickedAbbr: 'MIN', locked: false }),
      gameItem('g2', { pickedAbbr: null, locked: false }),
    ]);
    expect(screen.getByText(/1 left/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Change pick/ }));
    });
    // Reopening is an editing affordance, not an un-pick.
    expect(screen.getByText(/1 left/i)).toBeInTheDocument();
  });
});
