import type { LedgerEntry, Payout, UnpaidLine } from '@/lib/ledger/types';
import type { PlayerStanding } from '@/lib/scoring/types';

/**
 * The pot counts every entry, paid or not. Entering is an obligation, so an
 * unpaid player still owes into the week and the winner is still owed it.
 */
export function potCents(entries: LedgerEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.buyInCents, 0);
}

export function cashAppLink(cashtag: string, cents: number): string {
  const tag = cashtag.startsWith('$') ? cashtag : `$${cashtag}`;
  return `https://cash.app/${tag}/${(cents / 100).toFixed(2)}`;
}

export function unpaidLines(entries: LedgerEntry[], cashtag: string | null): UnpaidLine[] {
  return entries
    .filter((entry) => entry.paidAt === null)
    .map((entry) => ({
      playerId: entry.playerId,
      owedCents: entry.buyInCents,
      payLink: cashtag ? cashAppLink(cashtag, entry.buyInCents) : null,
    }));
}

export class UnallocatedPotError extends Error {
  constructor(potCentsValue: number) {
    super(`UnallocatedPotError: a pot of ${potCentsValue} cents has no entered rank-1 winner`);
    this.name = 'UnallocatedPotError';
  }
}

/**
 * Distributes 100% of the pot across every rank-1 finisher who actually
 * entered the week. There is no rake.
 *
 * Standings cover the pool's whole active roster, but only entrants owe into
 * the pot — so a player who sat the week out can tie at rank 1 (everyone is
 * 0-correct before the first game finalizes) and must not be paid.
 *
 * Leftover cents from an uneven split go one each to the earliest winners in
 * standings order, so the payouts always sum to exactly the pot.
 */
export function computePayouts(standings: PlayerStanding[], entries: LedgerEntry[]): Payout[] {
  const pot = potCents(entries);
  if (pot === 0) return [];

  const entered = new Set(entries.map((entry) => entry.playerId));
  const winners = standings.filter((s) => s.rank === 1 && entered.has(s.playerId));
  if (winners.length === 0) throw new UnallocatedPotError(pot);

  const base = Math.floor(pot / winners.length);
  const remainder = pot - base * winners.length;

  return winners.map((winner, index) => ({
    playerId: winner.playerId,
    cents: base + (index < remainder ? 1 : 0),
  }));
}
