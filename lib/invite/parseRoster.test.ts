import { describe, it, expect } from 'vitest';
import { parseRoster } from '@/lib/invite/parseRoster';

describe('parseRoster', () => {
  it('reads a comma-separated name and address', () => {
    expect(parseRoster('Bill Campbell, bill@x.test')).toEqual({
      players: [{ name: 'Bill Campbell', email: 'bill@x.test' }],
      errors: [],
    });
  });

  it('reads the angle-bracket form', () => {
    expect(parseRoster('Bill Campbell <bill@x.test>').players).toEqual([
      { name: 'Bill Campbell', email: 'bill@x.test' },
    ]);
  });

  it('accepts a name with no address, because several real players have none', () => {
    expect(parseRoster('Bill Campbell').players).toEqual([{ name: 'Bill Campbell', email: null }]);
  });

  it('lower-cases the address so it matches the unique index', () => {
    expect(parseRoster('Bill, BILL@X.TEST').players[0]!.email).toBe('bill@x.test');
  });

  it('trims whitespace around both halves', () => {
    expect(parseRoster('   Bill Campbell   ,   bill@x.test   ').players).toEqual([
      { name: 'Bill Campbell', email: 'bill@x.test' },
    ]);
  });

  it('ignores blank lines and hash comments', () => {
    const parsed = parseRoster('# stragglers\n\nBill, bill@x.test\n\n');
    expect(parsed.players).toHaveLength(1);
    expect(parsed.errors).toEqual([]);
  });

  it('splits on the last comma, so a suffix stays part of the name', () => {
    expect(parseRoster('Bill Campbell, Jr., bill@x.test').players).toEqual([
      { name: 'Bill Campbell, Jr.', email: 'bill@x.test' },
    ]);
  });

  it('keeps a comma in the name in the angle-bracket form too', () => {
    expect(parseRoster('Bill Campbell, Jr. <bill@x.test>').players).toEqual([
      { name: 'Bill Campbell, Jr.', email: 'bill@x.test' },
    ]);
  });

  it('treats a comma-bearing line with no @ as one name', () => {
    expect(parseRoster('Bill Campbell, Jr.').players).toEqual([
      { name: 'Bill Campbell, Jr.', email: null },
    ]);
  });

  it('rejects a line with an address but no name', () => {
    expect(parseRoster(', bill@x.test')).toEqual({
      players: [],
      errors: [{ line: 1, text: ', bill@x.test', reason: 'a name is required' }],
    });
  });

  it('rejects a bare address with no name', () => {
    expect(parseRoster('bill@x.test').errors[0]!.reason).toBe('a name is required');
  });

  it('rejects a malformed address once an @ shows an address was intended', () => {
    const parsed = parseRoster('Bill, bill@@x.test');
    expect(parsed.players).toEqual([]);
    expect(parsed.errors[0]!.reason).toBe('malformed email address');
  });

  it('reads a comma line with no @ as one name, not a malformed address', () => {
    // This is the same shape as "Bill Campbell, Jr." and there is no way to
    // tell a suffix from a typo without guessing. No @ means no address was
    // intended, so the comma is punctuation.
    expect(parseRoster('Bill, not-an-email').players).toEqual([
      { name: 'Bill, not-an-email', email: null },
    ]);
  });

  it('reports the second use of an address instead of dropping it silently', () => {
    const parsed = parseRoster('Bill, bill@x.test\nWilliam, bill@x.test');
    expect(parsed.players).toHaveLength(1);
    expect(parsed.errors).toEqual([
      { line: 2, text: 'William, bill@x.test', reason: 'duplicate of an earlier line' },
    ]);
  });

  it('matches duplicates without regard to case', () => {
    expect(parseRoster('Bill, BILL@X.TEST\nWilliam, bill@x.test').errors).toHaveLength(1);
  });

  it('does not treat two name-only lines as duplicates', () => {
    // Two people really can share a name, and there is no address to compare.
    expect(parseRoster('Mike\nMike').players).toHaveLength(2);
  });

  it('numbers lines from one, counting the blanks and comments it skipped', () => {
    expect(parseRoster('# header\n\nBill, bill@x.test\n, orphan@x.test').errors[0]!.line).toBe(4);
  });

  it('returns nothing for empty input', () => {
    expect(parseRoster('')).toEqual({ players: [], errors: [] });
  });

  it('keeps good lines when a bad one sits between them', () => {
    const parsed = parseRoster('Bill, bill@x.test\n, orphan@x.test\nKenneth, ken@x.test');
    expect(parsed.players).toHaveLength(2);
    expect(parsed.errors).toHaveLength(1);
  });

  it('handles CRLF line endings, which is what a paste from Windows carries', () => {
    expect(parseRoster('Bill, bill@x.test\r\nKenneth, ken@x.test').players).toHaveLength(2);
  });
});
