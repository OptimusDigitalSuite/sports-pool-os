import type {
  EntryRow,
  GameRow,
  PickRow,
  PlayerRow,
  PoolRow,
  TiebreakerGuessRow,
  WeekResultRow,
  WeekRow,
} from '@/lib/db/types';

export type AgentName = 'scorekeeper' | 'autopick' | 'commissioner' | 'recap';

export type NotificationTemplate =
  | 'picks_open'
  | 'unpicked_nag'
  | 'unpaid_nag'
  | 'week_winner'
  | 'week_recap';

export type Action =
  | { type: 'freeze_week'; weekId: string }
  | { type: 'sync_week'; season: number; weekNumber: number }
  | { type: 'auto_pick'; playerId: string; weekId: string; gameId: string; pickedAbbr: string }
  | {
      type: 'notify';
      playerId: string;
      template: NotificationTemplate;
      dedupeKey: string;
      subject: string;
      body: string;
    }
  | { type: 'generate_recap'; weekId: string };

/**
 * Everything an agent is allowed to see. Loaded once per tick by the executor
 * so agents never touch I/O and `now` is injectable in tests.
 */
export interface TickState {
  pool: PoolRow;
  week: WeekRow;
  games: GameRow[];
  players: PlayerRow[];
  picks: PickRow[];
  guesses: TiebreakerGuessRow[];
  entries: EntryRow[];
  results: WeekResultRow[];
  now: Date;
}

export interface Agent {
  readonly name: AgentName;
  decide(state: TickState): Action[];
}
