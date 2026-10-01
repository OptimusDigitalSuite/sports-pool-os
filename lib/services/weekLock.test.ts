import { describe, it, expect } from 'vitest';
import { isWeekLocked, weekLockAtMs, type WeekLockInput } from '@/lib/services/weekLock';

const THU = '2026-09-10T00:20:00.000Z'; // week's first kickoff
const SUN = '2026-09-13T17:00:00.000Z';
const MON = '2026-09-15T00:15:00.000Z'; // tiebreak game

function input(overrides: Partial<WeekLockInput> = {}): WeekLockInput {
  return {
    status: 'open',
    lockOverride: null,
    kickoffs: [SUN, THU, MON],
    now: new Date('2026-09-09T00:00:00.000Z'),
    ...overrides,
  };
}

describe('weekLockAtMs', () => {
  it('is the earliest kickoff, not the first one listed', () => {
    expect(weekLockAtMs([SUN, THU, MON])).toBe(Date.parse(THU));
  });

  it('skips unreadable timestamps rather than letting one decide the week', () => {
    expect(weekLockAtMs(['not a date', SUN, THU])).toBe(Date.parse(THU));
  });

  it('is null when nothing can be read', () => {
    expect(weekLockAtMs([])).toBeNull();
    expect(weekLockAtMs(['nonsense', ''])).toBeNull();
  });
});

describe('isWeekLocked', () => {
  it('is open before the first kickoff', () => {
    expect(isWeekLocked(input({ now: new Date('2026-09-09T23:00:00.000Z') }))).toBe(false);
  });

  it('locks at the first kickoff exactly', () => {
    expect(isWeekLocked(input({ now: new Date(THU) }))).toBe(true);
  });

  it('locks Sunday games once Thursday has kicked off', () => {
    // The rule that changed: this instant is still hours before the Sunday
    // slate, and under per-game locking those games were freely pickable.
    const sundayMorning = new Date('2026-09-13T14:00:00.000Z');
    expect(Date.parse(SUN)).toBeGreaterThan(sundayMorning.getTime());
    expect(isWeekLocked(input({ now: sundayMorning }))).toBe(true);
  });

  it('lets the commissioner close a week early', () => {
    expect(
      isWeekLocked(input({ lockOverride: 'locked', now: new Date('2026-09-08T00:00:00.000Z') })),
    ).toBe(true);
  });

  it('lets the commissioner reopen a week after the deadline', () => {
    expect(
      isWeekLocked(input({ lockOverride: 'open', now: new Date('2026-09-14T00:00:00.000Z') })),
    ).toBe(false);
  });

  it('keeps a frozen week closed even when reopened', () => {
    // Freezing is the settled, paid-out state. An override must not reopen it.
    expect(isWeekLocked(input({ status: 'frozen', lockOverride: 'open' }))).toBe(true);
  });

  it('locks when no deadline can be read', () => {
    expect(isWeekLocked(input({ kickoffs: [] }))).toBe(true);
    expect(isWeekLocked(input({ kickoffs: ['garbage'] }))).toBe(true);
  });
});
