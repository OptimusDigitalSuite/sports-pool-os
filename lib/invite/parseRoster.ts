export interface RosterLine {
  name: string;
  email: string | null;
}

export interface RosterError {
  /** 1-based, matching the line the commissioner sees in the textarea. */
  line: number;
  /** The offending line, trimmed. */
  text: string;
  reason: string;
}

export interface ParsedRoster {
  players: RosterLine[];
  errors: RosterError[];
}

/**
 * Deliberately loose. This only has to catch a typed mistake like a missing
 * "@" — whether an address actually receives mail is answered by sending to
 * it, not by a regular expression.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Exported so the console's "add an address to an existing player" path
 * applies the same rule a pasted roster does. Two definitions of "looks like
 * an email" would eventually disagree.
 */
export function looksLikeEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

const ANGLE_FORM = /^(.*)<([^>]*)>$/;

/**
 * Turns a pasted roster into rows and complaints.
 *
 * Names contain commas — "Bill Campbell, Jr." — so the split is resolved in a
 * fixed order rather than by grabbing the first separator:
 *
 *   1. Angle brackets win: everything before "<" is the name, whatever
 *      punctuation it holds.
 *   2. Otherwise, if the line contains "@", split on the *last* comma.
 *      Splitting on the first would truncate the name and then fail to parse
 *      the remainder as an address.
 *   3. Otherwise the whole line is a name. No "@" means no address was
 *      intended, so a comma is just punctuation.
 *
 * Nothing throws. A bad line becomes an error and its neighbours still parse,
 * because a roster of twelve people should not be rejected over one typo.
 *
 * A name with no address is valid, not an error: several real players have no
 * email, and refusing them would refuse the pool.
 */
export function parseRoster(text: string): ParsedRoster {
  const players: RosterLine[] = [];
  const errors: RosterError[] = [];
  const seen = new Set<string>();

  // A paste from Windows carries CRLF; the per-line trim() below absorbs the
  // stray \r, so splitting on \n alone is enough. Verified rather than
  // assumed: matching /\r?\n/ here changes no observable behaviour, so it was
  // removed instead of kept as decoration.
  const lines = text.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const trimmed = (lines[index] ?? '').trim();

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const fail = (reason: string) => errors.push({ line: lineNumber, text: trimmed, reason });

    let name: string;
    let rawEmail: string | null;

    const angle = ANGLE_FORM.exec(trimmed);
    if (angle) {
      name = (angle[1] ?? '').trim();
      rawEmail = (angle[2] ?? '').trim();
    } else if (trimmed.includes('@')) {
      const comma = trimmed.lastIndexOf(',');
      if (comma === -1) {
        // An address with nothing in front of it.
        fail('a name is required');
        continue;
      }
      name = trimmed.slice(0, comma).trim();
      rawEmail = trimmed.slice(comma + 1).trim();
    } else {
      name = trimmed;
      rawEmail = null;
    }

    if (name === '') {
      fail('a name is required');
      continue;
    }

    if (rawEmail === null) {
      players.push({ name, email: null });
      continue;
    }

    const email = rawEmail.toLowerCase();
    if (!EMAIL.test(email)) {
      fail('malformed email address');
      continue;
    }

    if (seen.has(email)) {
      fail('duplicate of an earlier line');
      continue;
    }

    seen.add(email);
    players.push({ name, email });
  }

  return { players, errors };
}
