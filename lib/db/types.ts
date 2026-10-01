export type GameStatusRow = 'scheduled' | 'in_progress' | 'final';
export type WeekStatus = 'open' | 'live' | 'frozen';

export interface PoolRow {
  id: string;
  name: string;
  season: number;
  buy_in_cents: number;
  settings: PoolSettings;
  created_at: string;
}

export interface PoolSettings {
  autopick_enabled: boolean;
  provider: 'espn' | 'manual';
  timezone: string;
  cashtag: string | null;
}

export interface PlayerRow {
  id: string;
  pool_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  magic_token: string;
  is_commissioner: boolean;
  is_active: boolean;
  created_at: string;
}

export interface GameRow {
  id: string;
  external_id: string;
  season: number;
  week: number;
  home_team: string;
  away_team: string;
  home_abbr: string;
  away_abbr: string;
  kickoff_at: string;
  home_score: number | null;
  away_score: number | null;
  status: GameStatusRow;
  updated_at: string;
}

export interface WeekRow {
  id: string;
  pool_id: string;
  season: number;
  week_number: number;
  tiebreak_game_id: string | null;
  status: WeekStatus;
  /** Commissioner override on the automatic deadline; null follows the clock. */
  lock_override: 'locked' | 'open' | null;
  frozen_at: string | null;
  created_at: string;
}

export interface PickRow {
  id: string;
  player_id: string;
  week_id: string;
  game_id: string;
  picked_abbr: string;
  is_auto: boolean;
  created_at: string;
  updated_at: string;
}

export interface TiebreakerGuessRow {
  id: string;
  player_id: string;
  week_id: string;
  predicted_total: number;
  updated_at: string;
}

export interface EntryRow {
  id: string;
  player_id: string;
  week_id: string;
  buy_in_cents: number;
  paid_at: string | null;
  method: string | null;
  confirmed_by: string | null;
  /** Set when the player locked their own card against accidental taps. */
  locked_at: string | null;
  created_at: string;
}

export interface WeekResultRow {
  id: string;
  week_id: string;
  player_id: string;
  correct: number;
  incorrect: number;
  voided: number;
  tiebreak_delta: number | null;
  rank: number;
  payout_cents: number;
}

export interface AgentRunRow {
  id: string;
  pool_id: string | null;
  agent: string;
  run_key: string;
  actions: unknown[];
  outcome: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  player_id: string | null;
  channel: string;
  template: string;
  dedupe_key: string;
  sent_at: string;
}

export const DEFAULT_POOL_SETTINGS: PoolSettings = {
  autopick_enabled: false,
  provider: 'espn',
  timezone: 'America/Chicago',
  cashtag: null,
};
