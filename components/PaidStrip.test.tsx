import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PaidStrip } from '@/components/PaidStrip';

afterEach(cleanup);

const lines = [
  { playerId: 'p1', name: 'Bill', paid: true, owedCents: 1000, payLink: null },
  { playerId: 'p2', name: 'Kenneth', paid: false, owedCents: 1000, payLink: 'https://cash.app/$Lafaze2009/10.00' },
];

describe('PaidStrip', () => {
  it('marks who has paid and who has not', () => {
    render(<PaidStrip lines={lines} />);
    expect(screen.getByTestId('chip-p1')).toHaveTextContent(/paid/i);
    expect(screen.getByTestId('chip-p2')).toHaveTextContent(/owes/i);
  });

  it('offers a pre-filled pay link only to the unpaid', () => {
    render(<PaidStrip lines={lines} />);
    expect(screen.getByRole('link', { name: /pay/i })).toHaveAttribute(
      'href',
      'https://cash.app/$Lafaze2009/10.00',
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('never celebrates a ledger action', () => {
    const { container } = render(<PaidStrip lines={lines} />);
    expect(container.querySelector('[class*="animate-"]')).toBeNull();
  });

  it('sends no referrer to cash.app — the page path is itself a credential', () => {
    render(<PaidStrip lines={lines} />);
    const link = screen.getByRole('link', { name: /pay/i });
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});
