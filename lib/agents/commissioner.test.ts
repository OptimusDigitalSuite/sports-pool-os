import { describe, it, expect } from 'vitest';
import { commissioner } from '@/lib/agents/commissioner';
import type { TickState } from '@/lib/agents/types';
import type { EntryRow, GameRow, PlayerRow, PoolRow, WeekResultRow, WeekRow } from '@/lib/db/types';

const pool: PoolRow = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn', timezone: 'America/Chicago', cashtag: '$Lafaze2009' },
  created_at: '',
};

const week: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g1', status: 'open', frozen_at: null, created_at: '',
  lock_override: null,
};

const game: GameRow = {
  id: 'g1', external_id: 'e1', season: 2026, week: 3,
  home_team: 'Minnesota Vikings', away_team: 'Green Bay Packers',
  home_abbr: 'MIN', away_abbr: 'GB', kickoff_at: '2026-09-20T17:00:00.000Z',
  home_score: null, away_score: null, status: 'scheduled', updated_at: '',
};

const player = (id: string, email: string | null): PlayerRow => ({
  id, pool_id: 'pool1', name: id, email, phone: null,
  magic_token: `tok-${id}`, is_commissioner: false, is_active: true, created_at: '',
});

const entry = (playerId: string, paid: boolean): EntryRow => ({
  id: `en-${playerId}`, player_id: playerId, week_id: 'w1', buy_in_cents: 1000,
  paid_at: paid ? '2026-09-20T12:00:00.000Z' : null, method: null, confirmed_by: null, locked_at: null, created_at: '',
});

const result = (playerId: string, rank: number, payout: number): WeekResultRow => ({
  id: `wr-${playerId}`, week_id: 'w1', player_id: playerId,
  correct: 10, incorrect: 3, voided: 0, tiebreak_delta: 2, rank, payout_cents: payout,
});

const state = (over: Partial<TickState> = {}): TickState => ({
  pool, week, games: [game], players: [player('p1', 'bill@x.test')],
  picks: [], guesses: [], entries: [], results: [],
  now: new Date('2026-09-19T14:00:00.000Z'),
  ...over,
});

// Every anchor below is stated as a distance from the fixture's only kickoff,
// 2026-09-20T17:00Z, because that — not the day of the week — is what the
// cadence keys off.
const TOO_EARLY = new Date('2026-09-16T14:00:00.000Z'); // 99h out
const ANNOUNCE = new Date('2026-09-18T14:00:00.000Z'); // 51h out
const EARLY_NAG = new Date('2026-09-20T00:00:00.000Z'); // 17h out
const FINAL_NAG = new Date('2026-09-20T15:00:00.000Z'); // 2h out

describe('commissioner', () => {
  it('announces that picks are open once the first kickoff is in range', () => {
    const actions = commissioner.decide(state({ now: ANNOUNCE }));
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'notify', template: 'picks_open', playerId: 'p1' });
  });

  it('nags an entrant who still has unpicked games as the deadline nears', () => {
    const actions = commissioner.decide(state({ now: EARLY_NAG, entries: [entry('p1', false)] }));
    const nag = actions.find((a) => a.type === 'notify' && a.template === 'unpicked_nag');
    expect(nag).toBeDefined();
  });

  it('does not nag someone who has picked every game', () => {
    const actions = commissioner.decide(
      state({
        now: EARLY_NAG,
        entries: [entry('p1', false)],
        picks: [{ id: 'pk1', player_id: 'p1', week_id: 'w1', game_id: 'g1', picked_abbr: 'MIN', is_auto: false, created_at: '', updated_at: '' }],
      }),
    );
    expect(actions.find((a) => a.type === 'notify' && a.template === 'unpicked_nag')).toBeUndefined();
  });

  it('chases an unpaid entry with the exact amount and a Cash App link', () => {
    const actions = commissioner.decide(
      state({ now: EARLY_NAG, entries: [entry('p1', false)] }),
    );
    const unpaid = actions.find((a) => a.type === 'notify' && a.template === 'unpaid_nag');
    expect(unpaid).toBeDefined();
    if (unpaid && unpaid.type === 'notify') {
      expect(unpaid.body).toContain('$10.00');
      expect(unpaid.body).toContain('https://cash.app/$Lafaze2009/10.00');
    }
  });

  it('does not chase an entry that is already paid', () => {
    const actions = commissioner.decide(
      state({ now: EARLY_NAG, entries: [entry('p1', true)] }),
    );
    expect(actions.find((a) => a.type === 'notify' && a.template === 'unpaid_nag')).toBeUndefined();
  });

  it('announces the winner once the week is frozen', () => {
    const actions = commissioner.decide(
      state({
        week: { ...week, status: 'frozen' },
        players: [player('p1', 'bill@x.test'), player('p2', 'ken@x.test')],
        results: [result('p1', 1, 2000), result('p2', 2, 0)],
      }),
    );
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.type === 'notify' && a.template === 'week_winner')).toBe(true);
    const first = actions[0];
    if (first && first.type === 'notify') expect(first.body).toContain('$20.00');
  });

  it('skips players with no email address', () => {
    const actions = commissioner.decide(
      state({ now: ANNOUNCE, players: [player('p1', null)] }),
    );
    expect(actions).toEqual([]);
  });

  it('gives every message a dedupe key scoped to the week and player', () => {
    const actions = commissioner.decide(state({ now: ANNOUNCE }));
    const first = actions[0];
    if (first && first.type === 'notify') {
      expect(first.dedupeKey).toBe('picks_open:w1:p1');
    }
  });

  it('says nothing while the first kickoff is still beyond the announce window', () => {
    expect(commissioner.decide(state({ now: TOO_EARLY }))).toEqual([]);
  });

  it('keys the cadence off the first kickoff, not the day of the week', () => {
    // Same instant as the passing announce case, but the game is a week later.
    const distant = [{ ...game, kickoff_at: '2026-09-27T17:00:00.000Z' }];
    expect(commissioner.decide(state({ now: ANNOUNCE, games: distant }))).toEqual([]);
  });

  it('still sends when the cron missed the exact hour it used to require', () => {
    // The old cadence gated on hour === 14 UTC, so a single missed tick lost
    // the message for good. The window is open-ended now: late is not lost.
    const odd = new Date('2026-09-18T09:37:00.000Z'); // 55h out, no round hour
    const actions = commissioner.decide(state({ now: odd }));
    expect(actions.some((a) => a.type === 'notify' && a.template === 'picks_open')).toBe(true);
  });

  it('nags before a Thursday opener, where a Saturday cadence would arrive too late', () => {
    // A real NFL week opens Thursday night. Under the weekday cadence the
    // first nag landed Saturday morning — after that game had already locked.
    const thursdayOpener = [{ ...game, kickoff_at: '2026-09-18T00:15:00.000Z' }];
    const actions = commissioner.decide(
      state({ now: new Date('2026-09-17T12:00:00.000Z'), games: thursdayOpener, entries: [entry('p1', false)] }),
    );
    expect(actions.some((a) => a.type === 'notify' && a.template === 'unpicked_nag')).toBe(true);
  });

  it('gives the early and final nags different dedupe keys so neither is swallowed', () => {
    const saturday = commissioner.decide(state({ now: EARLY_NAG, entries: [entry('p1', false)] }));
    const sunday = commissioner.decide(state({ now: FINAL_NAG, entries: [entry('p1', false)] }));

    const keysFor = (actions: ReturnType<typeof commissioner.decide>, template: string) =>
      actions.filter((a) => a.type === 'notify' && a.template === template).map((a) => (a.type === 'notify' ? a.dedupeKey : ''));

    expect(keysFor(saturday, 'unpicked_nag')[0]).not.toBe(keysFor(sunday, 'unpicked_nag')[0]);
    expect(keysFor(saturday, 'unpaid_nag')[0]).not.toBe(keysFor(sunday, 'unpaid_nag')[0]);
  });

  it('does nothing for a synthetic, unsaved bootstrap week (empty id)', () => {
    // A pool with no weeks row yet gets a synthetic week 1 placeholder with
    // no schedule and no entries. Announcing "picks are open" for it would
    // promise a week that does not exist.
    expect(
      commissioner.decide(state({ week: { ...week, id: '' }, now: ANNOUNCE })),
    ).toEqual([]);
  });

  it('keeps a once-per-week message on a single key across ticks', () => {
    const first = commissioner.decide(state({ now: ANNOUNCE }));
    const second = commissioner.decide(state({ now: EARLY_NAG }));
    const key = (actions: ReturnType<typeof commissioner.decide>) =>
      actions[0]?.type === 'notify' ? actions[0].dedupeKey : '';
    expect(key(first)).toBe('picks_open:w1:p1');
    expect(key(second)).toBe('picks_open:w1:p1');
  });
});
