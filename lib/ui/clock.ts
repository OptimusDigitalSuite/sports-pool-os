/**
 * Times, in the pool's timezone rather than the server's.
 *
 * `toLocaleString` with no timezone uses the runtime's, which on Vercel is
 * UTC. A server-rendered deadline then reads five or six hours late and often
 * on the wrong weekday — "Thursday 12:20 AM" for a Wednesday 7:20 PM kickoff.
 * A client component eventually corrects itself on hydration; a server
 * component never does. Passing the pool's zone explicitly makes both agree,
 * and makes the rendered string independent of where it was rendered.
 */
function zoned(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    // An unknown zone must not blank the deadline out. UTC is wrong by hours;
    // a thrown RangeError is wrong by the whole page.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }
}

export function kickoffLabel(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return zoned(timeZone, { hour: 'numeric', minute: '2-digit' }).format(ms);
}

/** The one string players act on, so it carries the weekday too. */
export function deadlineLabel(ms: number, timeZone: string): string {
  if (!Number.isFinite(ms)) return '';
  return zoned(timeZone, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
    .format(ms)
    .replace(/,\s*/, ' ');
}
