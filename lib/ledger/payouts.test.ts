import { describe, it, expect } from 'vitest';
import { cashAppLink, computePayouts, potCents, unpaidLines } from '@/lib/ledger/payouts';
import type { LedgerEntry } from '@/lib/ledger/types';
import type { PlayerStanding } from '@/lib/scoring/types';

const entry = (playerId: string, paid: boolean): LedgerEntry => ({
  playerId,
  buyInCents: 1000,
  paidAt: paid ? '2026-09-13T12:00:00.000Z' : null,
});

const standing = (playerId: string, rank: number): PlayerStanding => ({
  playerId,
  name: playerId,
  correct: 10,
  incorrect: 3,
  voided: 0,
  stillAlive: 0,
  predictedTotal: 45,
  tiebreakDelta: 2,
  rank,
});

describe('potCents', () => {
  it('counts every entry, paid or not, because an entry is an obligation', () => {
    expect(potCents([entry('p1', true), entry('p2', false), entry('p3', true)])).toBe(3000);
  });

  it('is zero for an empty week', () => {
    expect(potCents([])).toBe(0);
  });
});

describe('computePayouts', () => {
  it('gives the whole pot to a sole winner', () => {
    const payouts = computePayouts(
      [standing('p1', 1), standing('p2', 2), standing('p3', 3)],
      [entry('p1', true), entry('p2', true), entry('p3', true)],
    );
    expect(payouts).toEqual([{ playerId: 'p1', cents: 3000 }]);
  });

  it('splits evenly between tied winners', () => {
    const payouts = computePayouts(
      [standing('p1', 1), standing('p2', 1), standing('p3', 3)],
      [entry('p1', true), entry('p2', true), entry('p3', true)],
    );
    expect(payouts).toEqual([
      { playerId: 'p1', cents: 1500 },
      { playerId: 'p2', cents: 1500 },
    ]);
  });

  it('distributes leftover cents deterministically rather than losing them', () => {
    const payouts = computePayouts(
      [standing('p1', 1), standing('p2', 1), standing('p3', 1), standing('p4', 4)],
      [entry('p1', true), entry('p2', true), entry('p3', true), entry('p4', true)],
    );
    expect(payouts.reduce((sum, x) => sum + x.cents, 0)).toBe(4000);
    expect(payouts.map((x) => x.cents)).toEqual([1334, 1333, 1333]);
  });

  it('pays out exactly the pot and never more', () => {
    const payouts = computePayouts(
      [standing('p1', 1), standing('p2', 1)],
      [entry('p1', true), entry('p2', false), entry('p3', false)],
    );
    expect(payouts.reduce((sum, x) => sum + x.cents, 0)).toBe(3000);
  });

  it('pays nobody when there are no entries', () => {
    expect(computePayouts([standing('p1', 1)], [])).toEqual([]);
  });

  it('pays a winner who never picked but did enter', () => {
    const payouts = computePayouts([standing('p1', 1)], [entry('p1', true)]);
    expect(payouts).toEqual([{ playerId: 'p1', cents: 1000 }]);
  });

  it('does not pay a rank-1 player who never entered the week', () => {
    const payouts = computePayouts(
      [standing('p1', 1), standing('p2', 1), standing('dana', 1)],
      [entry('p1', true), entry('p2', false)],
    );
    expect(payouts.map((x) => x.playerId)).toEqual(['p1', 'p2']);
    expect(payouts.reduce((sum, x) => sum + x.cents, 0)).toBe(2000);
  });

  it('throws rather than silently losing a pot with no entered winner', () => {
    expect(() => computePayouts([standing('dana', 1)], [entry('p1', true)])).toThrow(/UnallocatedPot/);
  });
});

describe('unpaidLines', () => {
  it('lists only the unpaid entries with a pre-filled link', () => {
    const lines = unpaidLines([entry('p1', true), entry('p2', false)], '$Lafaze2009');
    expect(lines).toEqual([
      { playerId: 'p2', owedCents: 1000, payLink: 'https://cash.app/$Lafaze2009/10.00' },
    ]);
  });

  it('omits the link when no cashtag is configured', () => {
    expect(unpaidLines([entry('p2', false)], null)[0]!.payLink).toBeNull();
  });
});

describe('cashAppLink', () => {
  it('formats cents as dollars', () => {
    expect(cashAppLink('$Lafaze2009', 1000)).toBe('https://cash.app/$Lafaze2009/10.00');
    expect(cashAppLink('$Lafaze2009', 2050)).toBe('https://cash.app/$Lafaze2009/20.50');
  });

  it('tolerates a cashtag written without the dollar sign', () => {
    expect(cashAppLink('Lafaze2009', 1000)).toBe('https://cash.app/$Lafaze2009/10.00');
  });
});
