export interface LedgerEntry {
  playerId: string;
  buyInCents: number;
  paidAt: string | null;
}

export interface Payout {
  playerId: string;
  cents: number;
}

export interface UnpaidLine {
  playerId: string;
  owedCents: number;
  /** Pre-filled Cash App deep link, or null when the pool has no cashtag set. */
  payLink: string | null;
}
