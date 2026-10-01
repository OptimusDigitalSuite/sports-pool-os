import { describe, it, expect } from 'vitest';
import { deadlineLabel, kickoffLabel } from '@/lib/ui/clock';

// 2026-09-10T00:20Z is Wednesday 7:20 PM in Chicago. Rendered in UTC it reads
// as Thursday 12:20 AM: the wrong time, on the wrong day, for the one deadline
// players must not miss.
const opener = '2026-09-10T00:20:00.000Z';

describe('kickoffLabel', () => {
  it('renders in the pool timezone, not the server timezone', () => {
    expect(kickoffLabel(opener, 'America/Chicago')).toBe('7:20 PM');
  });

  it('renders the same instant differently for a pool elsewhere', () => {
    expect(kickoffLabel(opener, 'America/New_York')).toBe('8:20 PM');
  });

  it('falls back to UTC rather than throwing on a nonsense timezone', () => {
    expect(kickoffLabel(opener, 'Not/AZone')).toBe('12:20 AM');
  });

  it('returns empty for an unreadable timestamp', () => {
    expect(kickoffLabel('never', 'America/Chicago')).toBe('');
  });
});

describe('deadlineLabel', () => {
  it('names the weekday in the pool timezone', () => {
    expect(deadlineLabel(Date.parse(opener), 'America/Chicago')).toBe('Wednesday 7:20 PM');
  });

  it('does not roll into the next day the way UTC does', () => {
    expect(deadlineLabel(Date.parse(opener), 'UTC')).toBe('Thursday 12:20 AM');
  });
});
