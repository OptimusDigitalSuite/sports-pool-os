import { describe, it, expect } from 'vitest';
import { scorekeeper } from '@/lib/agents/scorekeeper';
import type { TickState } from '@/lib/agents/types';
import type { GameRow, PoolRow, WeekRow } from '@/lib/db/types';

const pool: PoolRow = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn', timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};

const week: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g2', status: 'live', frozen_at: null, created_at: '',
  lock_override: null,
};

const game = (id: string, status: GameRow['status'], scored = true): GameRow => ({
  id, external_id: `e${id}`, season: 2026, week: 3,
  home_team: 'Home', away_team: 'Away', home_abbr: 'H', away_abbr: 'A',
  kickoff_at: '2026-09-20T17:00:00.000Z',
  home_score: scored && status === 'final' ? 24 : null,
  away_score: scored && status === 'final' ? 20 : null,
  status, updated_at: '',
});

const state = (over: Partial<TickState> = {}): TickState => ({
  pool, week, games: [], players: [], picks: [], guesses: [], entries: [], results: [],
  now: new Date('2026-09-23T05:00:00.000Z'),
  ...over,
});

describe('scorekeeper', () => {
  it('freezes the week once every game is final', () => {
    const actions = scorekeeper.decide(state({ games: [game('g1', 'final'), game('g2', 'final')] }));
    expect(actions).toEqual([{ type: 'freeze_week', weekId: 'w1' }]);
  });

  it('asks for a sync while any game is unfinished', () => {
    const actions = scorekeeper.decide(state({ games: [game('g1', 'final'), game('g2', 'in_progress')] }));
    expect(actions).toEqual([{ type: 'sync_week', season: 2026, weekNumber: 3 }]);
  });

  it('asks for a sync when a final game has no scores yet', () => {
    const actions = scorekeeper.decide(state({ games: [game('g1', 'final'), game('g2', 'final', false)] }));
    expect(actions).toEqual([{ type: 'sync_week', season: 2026, weekNumber: 3 }]);
  });

  it('does not touch a frozen week before its last kickoff has passed', () => {
    // Kickoff is 2026-09-20T17:00:00.000Z; `now` here is before that, so the
    // week is frozen but its games have not all started yet — nothing to do.
    const frozen = state({
      games: [game('g1', 'final')],
      week: { ...week, status: 'frozen' },
      now: new Date('2026-09-20T10:00:00.000Z'),
    });
    expect(scorekeeper.decide(frozen)).toEqual([]);
  });

  it('asks for a sync for a week with no games', () => {
    const actions = scorekeeper.decide(state({ games: [] }));
    expect(actions).toEqual([{ type: 'sync_week', season: 2026, weekNumber: 3 }]);
  });

  it('opens the next week once a frozen week is past its last kickoff', () => {
    const frozen = state({ games: [game('g1', 'final')], week: { ...week, status: 'frozen' } });
    expect(scorekeeper.decide(frozen)).toEqual([
      { type: 'sync_week', season: 2026, weekNumber: 4 },
    ]);
  });

  it('does not advance past a frozen week 18', () => {
    const frozen = state({
      games: [game('g1', 'final')],
      week: { ...week, week_number: 18, status: 'frozen' },
    });
    expect(scorekeeper.decide(frozen)).toEqual([]);
  });

  it('does not advance a frozen week with no games', () => {
    const frozen = state({ games: [], week: { ...week, status: 'frozen' } });
    expect(scorekeeper.decide(frozen)).toEqual([]);
  });

});
