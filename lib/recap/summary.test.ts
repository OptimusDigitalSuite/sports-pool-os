import { describe, it, expect } from 'vitest';
import { plainSummary } from '@/lib/recap/summary';

const rows = [
  { name: 'Bill', correct: 11, incorrect: 2, rank: 1, payoutCents: 3000, tiebreakDelta: 1, autoPicks: 0 },
  { name: 'Kenneth', correct: 9, incorrect: 4, rank: 2, payoutCents: 0, tiebreakDelta: 9, autoPicks: 3 },
];

describe('plainSummary', () => {
  it('names the winner, the take, and the record', () => {
    const text = plainSummary({ weekNumber: 3, potCents: 3000, rows });
    expect(text).toContain('Week 3');
    expect(text).toContain('Bill');
    expect(text).toContain('11-2');
    expect(text).toContain('$30.00');
  });

  it('lists everyone in finishing order', () => {
    const text = plainSummary({ weekNumber: 3, potCents: 3000, rows });
    expect(text.indexOf('Bill')).toBeLessThan(text.indexOf('Kenneth'));
  });

  it('handles a week nobody won', () => {
    const text = plainSummary({ weekNumber: 3, potCents: 0, rows: [] });
    expect(text).toContain('Week 3');
    expect(text).not.toContain('undefined');
  });
});
