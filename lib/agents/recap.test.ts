import { describe, it, expect } from 'vitest';
import { recap } from '@/lib/agents/recap';
import type { TickState } from '@/lib/agents/types';
import type { PoolRow, WeekResultRow, WeekRow } from '@/lib/db/types';

const pool: PoolRow = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn', timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};

const week: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g1', status: 'frozen', frozen_at: '2026-09-23T05:00:00.000Z', created_at: '',
  lock_override: null,
};

const result: WeekResultRow = {
  id: 'wr1', week_id: 'w1', player_id: 'p1',
  correct: 10, incorrect: 3, voided: 0, tiebreak_delta: 2, rank: 1, payout_cents: 2000,
};

const state = (over: Partial<TickState> = {}): TickState => ({
  pool, week, games: [], players: [], picks: [], guesses: [], entries: [], results: [result],
  now: new Date('2026-09-23T05:05:00.000Z'),
  ...over,
});

describe('recap', () => {
  it('asks for a recap once the week is frozen and results exist', () => {
    expect(recap.decide(state())).toEqual([{ type: 'generate_recap', weekId: 'w1' }]);
  });

  it('does nothing before the week is frozen', () => {
    expect(recap.decide(state({ week: { ...week, status: 'live' } }))).toEqual([]);
  });

  it('does nothing when the week froze with no results', () => {
    expect(recap.decide(state({ results: [] }))).toEqual([]);
  });

  it('does nothing for a synthetic, unsaved bootstrap week (empty id)', () => {
    expect(recap.decide(state({ week: { ...week, id: '', status: 'frozen' } }))).toEqual([]);
  });
});
