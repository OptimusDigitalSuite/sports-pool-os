import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/lib/db/client', () => ({ createServiceClient: () => ({}) }));

const commissioner = {
  id: 'p1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'commish-tok',
  is_commissioner: true,
  is_active: true,
  created_at: '',
};

const regularPlayer = { ...commissioner, id: 'p2', magic_token: 'player-tok', is_commissioner: false };

let viewer: typeof commissioner | null = commissioner;

vi.mock('@/lib/db/repositories', () => ({
  createRepositories: () => ({
    players: { getByToken: async () => viewer },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlayerLayout tab bar', () => {
  it('shows an Admin link for a commissioner', async () => {
    viewer = commissioner;
    const { default: PlayerLayout } = await import('@/app/p/[token]/layout');
    const element = await PlayerLayout({
      children: <div />,
      params: Promise.resolve({ token: 'commish-tok' }),
    });
    render(element);

    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/p/commish-tok/admin',
    );
  });

  it('does not show an Admin link for a regular player', async () => {
    viewer = regularPlayer;
    const { default: PlayerLayout } = await import('@/app/p/[token]/layout');
    const element = await PlayerLayout({
      children: <div />,
      params: Promise.resolve({ token: 'player-tok' }),
    });
    render(element);

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('does not show an Admin link for an unknown token', async () => {
    viewer = null;
    const { default: PlayerLayout } = await import('@/app/p/[token]/layout');
    const element = await PlayerLayout({
      children: <div />,
      params: Promise.resolve({ token: 'bogus' }),
    });
    render(element);

    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('still shows Picks and Standings regardless of viewer', async () => {
    viewer = regularPlayer;
    const { default: PlayerLayout } = await import('@/app/p/[token]/layout');
    const element = await PlayerLayout({
      children: <div />,
      params: Promise.resolve({ token: 'player-tok' }),
    });
    render(element);

    expect(screen.getByRole('link', { name: 'Picks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Standings' })).toBeInTheDocument();
    // Everyone is a player tab, not a commissioner one — the page itself
    // refuses to reveal anything before the week locks.
    expect(screen.getByRole('link', { name: 'Everyone' })).toHaveAttribute(
      'href',
      '/p/player-tok/everyone',
    );
  });
});
