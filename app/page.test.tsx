import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Home from '@/app/page';

beforeEach(() => {
  // VideoBackdrop reads prefers-reduced-motion; jsdom has no matchMedia.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(cleanup);

describe('root page', () => {
  it('explains this is a link-only app rather than 404ing', () => {
    render(<Home />);
    expect(screen.getByText(/commissioner/i)).toBeInTheDocument();
  });

  it('carries no sign-up or login form — there is nothing to do here but read', () => {
    render(<Home />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
