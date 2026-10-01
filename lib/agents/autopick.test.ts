import { describe, it, expect } from 'vitest';
import { autopick, AUTOPICK_MAX_PER_TICK } from '@/lib/agents/autopick';
import type { TickState } from '@/lib/agents/types';
import type { EntryRow, GameRow, PickRow, PlayerRow, PoolRow, WeekRow } from '@/lib/db/types';

const KICKOFF = '2026-09-20T17:00:00.000Z';

const pool = (autopickEnabled: boolean): PoolRow => ({
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: autopickEnabled, provider: 'espn', timezone: 'America/Chicago', cashtag: null },
  created_at: '',
});

const week: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g1', status: 'open', frozen_at: null, created_at: '',
  lock_override: null,
};

const game: GameRow = {
  id: 'g1', external_id: 'e1', season: 2026, week: 3,
  home_team: 'Minnesota Vikings', away_team: 'Green Bay Packers',
  home_abbr: 'MIN', away_abbr: 'GB', kickoff_at: KICKOFF,
  home_score: null, away_score: null, status: 'scheduled', updated_at: '',
};

const player = (id: string): PlayerRow => ({
  id, pool_id: 'pool1', name: id, email: null, phone: null,
  magic_token: `tok-${id}`, is_commissioner: false, is_active: true, created_at: '',
});

const entry = (playerId: string): EntryRow => ({
  id: `en-${playerId}`, player_id: playerId, week_id: 'w1', buy_in_cents: 1000,
  paid_at: null, method: null, confirmed_by: null, locked_at: null, created_at: '',
});

const pick = (playerId: string): PickRow => ({
  id: `pk-${playerId}`, player_id: playerId, week_id: 'w1', game_id: 'g1',
  picked_abbr: 'GB', is_auto: false, created_at: '', updated_at: '',
});

const state = (over: Partial<TickState> = {}): TickState => ({
  pool: pool(true), week, games: [game], players: [player('p1')],
  picks: [], guesses: [], entries: [entry('p1')], results: [],
  now: new Date('2026-09-20T16:50:00.000Z'),
  ...over,
});

describe('autopick', () => {
  it('fills the home team inside the lead window for an entrant with no pick', () => {
    expect(autopick.decide(state())).toEqual([
      { type: 'auto_pick', playerId: 'p1', weekId: 'w1', gameId: 'g1', pickedAbbr: 'MIN' },
    ]);
  });

  it('does nothing when the pool has auto-pick switched off', () => {
    expect(autopick.decide(state({ pool: pool(false) }))).toEqual([]);
  });

  it('does nothing more than fifteen minutes before kickoff', () => {
    expect(autopick.decide(state({ now: new Date('2026-09-20T16:44:00.000Z') }))).toEqual([]);
  });

  it('still fills a pick after kickoff has passed', () => {
    expect(autopick.decide(state({ now: new Date('2026-09-20T17:30:00.000Z') }))).toHaveLength(1);
  });

  it('leaves an existing pick alone', () => {
    expect(autopick.decide(state({ picks: [pick('p1')] }))).toEqual([]);
  });

  it('never picks for a player who did not enter the week', () => {
    expect(autopick.decide(state({ entries: [] }))).toEqual([]);
  });

  it('never picks for an inactive player', () => {
    const inactive = { ...player('p1'), is_active: false };
    expect(autopick.decide(state({ players: [inactive] }))).toEqual([]);
  });

  it('does not touch a frozen week', () => {
    expect(autopick.decide(state({ week: { ...week, status: 'frozen' } }))).toEqual([]);
  });

  it('does nothing for a synthetic, unsaved bootstrap week (empty id), even with an entrant', () => {
    // Explicit rather than relying on the synthetic week's empty entries list
    // to make this a no-op by accident.
    expect(autopick.decide(state({ week: { ...week, id: '' } }))).toEqual([]);
  });

  it('skips a game whose kickoff time cannot be read', () => {
    const bad = { ...game, kickoff_at: 'not-a-date' };
    expect(autopick.decide(state({ games: [bad] }))).toEqual([]);
  });

  it('covers several entrants and several games in one pass', () => {
    const g2: GameRow = { ...game, id: 'g2', home_abbr: 'CHI', away_abbr: 'DET' };
    const actions = autopick.decide(
      state({ games: [game, g2], players: [player('p1'), player('p2')], entries: [entry('p1'), entry('p2')] }),
    );
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.type === 'auto_pick' && a.pickedAbbr)).toEqual(['MIN', 'CHI', 'MIN', 'CHI']);
  });

  it('caps the actions in one tick, leaving the rest for the next tick', () => {
    // 50 entrants x 1 game each = 50 possible actions, well over the cap.
    const players = Array.from({ length: 50 }, (_, i) => player(`p${i}`));
    const entries = players.map((p) => entry(p.id));
    const actions = autopick.decide(state({ players, entries, games: [game] }));
    expect(actions).toHaveLength(AUTOPICK_MAX_PER_TICK);
  });
});
