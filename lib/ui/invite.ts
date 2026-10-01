import { randomBytes } from 'node:crypto';

/**
 * The player's credential. 32 bytes of CSPRNG entropy, base64url — long
 * enough that guessing one is not a threat model, short enough to paste.
 * Never node:crypto's Math.random-backed alternatives: this token IS the
 * player's login, so it must come from a cryptographically secure source.
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Adding someone is the whole onboarding: this is the entire message the
 * commissioner pastes into the group chat. No signup form, no password.
 */
export function buildInvite(input: {
  baseUrl: string;
  token: string;
  playerName: string;
  poolName: string;
  buyInCents: number;
}): string {
  const link = `${input.baseUrl.replace(/\/$/, '')}/p/${input.token}`;
  const buyIn = `$${(input.buyInCents / 100).toFixed(2)}`;
  return [
    `${input.playerName} — you're in ${input.poolName}.`,
    `${buyIn} a week, most wins takes the pot, Monday's combined score breaks ties.`,
    `This link is just for you, it logs you in and keeps you logged in:`,
    link,
  ].join('\n');
}

/**
 * The same message as `buildInvite`, plus the commissioner console link —
 * for the one player whose invite is also their login to app/p/[token]/admin
 * (the console is gated on exactly this token, per the same is_commissioner
 * check the page itself makes). A separate function rather than a flag on
 * `buildInvite` so a bug here can never leak the console link into a normal
 * player's invite.
 */
export function buildCommissionerInvite(input: {
  baseUrl: string;
  token: string;
  playerName: string;
  poolName: string;
  buyInCents: number;
}): string {
  const consoleLink = `${input.baseUrl.replace(/\/$/, '')}/p/${input.token}/admin`;
  return [buildInvite(input), '', `Your commissioner console:`, consoleLink].join('\n');
}
