import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { AutoRefresh } from '@/components/AutoRefresh';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  setHidden(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // Restore document.hidden to jsdom's normal (visible) default so it
  // doesn't leak between test files.
  setHidden(false);
});

describe('AutoRefresh', () => {
  it('renders its children unchanged', () => {
    const { getByText } = render(
      <AutoRefresh intervalMs={30_000}>
        <div>standings content</div>
      </AutoRefresh>,
    );
    expect(getByText('standings content')).toBeInTheDocument();
  });

  it('calls router.refresh() on the given interval while the document is visible', () => {
    render(
      <AutoRefresh intervalMs={1000}>
        <div />
      </AutoRefresh>,
    );
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('does not fire while the document is hidden', () => {
    setHidden(true);
    render(
      <AutoRefresh intervalMs={1000}>
        <div />
      </AutoRefresh>,
    );
    vi.advanceTimersByTime(5000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('pauses when the tab is hidden mid-flight and resumes when it becomes visible again', () => {
    render(
      <AutoRefresh intervalMs={1000}>
        <div />
      </AutoRefresh>,
    );
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    // No further calls while hidden — the interval was actually cleared,
    // not just left running with a no-op guard.
    expect(refresh).toHaveBeenCalledTimes(1);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    // Becoming visible again refreshes immediately (Fix 4) — a player who
    // was gone for 90 minutes shouldn't see 90-minute-old data for up to
    // another 30s just because the interval hasn't ticked yet.
    expect(refresh).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('refreshes immediately on becoming visible, before the next interval tick', () => {
    setHidden(true);
    render(
      <AutoRefresh intervalMs={30_000}>
        <div />
      </AutoRefresh>,
    );
    expect(refresh).not.toHaveBeenCalled();

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    // No time has advanced at all — this can only be the immediate refresh
    // fired by becoming visible, not the 30s interval.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('clears the interval on unmount so it never fires after the component is gone', () => {
    const { unmount } = render(
      <AutoRefresh intervalMs={1000}>
        <div />
      </AutoRefresh>,
    );
    vi.advanceTimersByTime(1000);
    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
