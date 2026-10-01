import { describe, it, expect } from 'vitest';
import { submitPick, submitTiebreak, PickRejectedError } from '@/lib/services/submitPick';
import type { Repositories } from '@/lib/db/repositories';
import type { GameRow, PlayerRow, PoolRow, WeekRow } from '@/lib/db/types';

const KICKOFF = '2026-09-20T17:00:00.000Z';

const gameRow: GameRow = {
  id: 'g1',
  external_id: 'e1',
  season: 2026,
  week: 3,
  home_team: 'Minnesota Vikings',
  away_team: 'Green Bay Packers',
  home_abbr: 'MIN',
  away_abbr: 'GB',
  kickoff_at: KICKOFF,
  home_score: null,
  away_score: null,
  status: 'scheduled',
  updated_at: '',
};

const poolRow: PoolRow = {
  id: 'pool1',
  name: 'Sunday Money',
  season: 2026,
  buy_in_cents: 1000,
  settings: { autopick_enabled: false, provider: 'espn', timezone: 'America/Chicago', cashtag: '$Lafaze2009' },
  created_at: '',
};

const weekRow: WeekRow = {
  id: 'w1',
  pool_id: 'pool1',
  season: 2026,
  week_number: 3,
  tiebreak_game_id: 'g1',
  lock_override: null,
  status: 'open',
  frozen_at: null,
  created_at: '',
};

const playerRow: PlayerRow = {
  id: 'p1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'tok',
  is_commissioner: false,
  is_active: true,
  created_at: '',
};

function stubRepos(over: { week?: WeekRow } = {}) {
  const picks: unknown[] = [];
  const entries: unknown[] = [];
  const guesses: unknown[] = [];
  const repos = {
    pools: { get: async () => poolRow },
    players: { listActive: async () => [], getByToken: async () => null, getById: async () => playerRow },
    games: { listByWeek: async () => [gameRow], getById: async () => gameRow, upsertMany: async () => {} },
    weekExclusions: { listByWeek: async () => [], add: async () => {}, remove: async () => {} },
    weeks: { find: async () => over.week ?? weekRow, getById: async () => over.week ?? weekRow, upsert: async () => weekRow },
    picks: { listByWeek: async () => [], upsert: async (p: unknown) => { picks.push(p); } },
    guesses: { listByWeek: async () => [], upsert: async (...a: unknown[]) => { guesses.push(a); } },
    entries: { listByWeek: async () => [], ensure: async (...a: unknown[]) => { entries.push(a); }, markPaid: async () => {} },
  } as unknown as Repositories;
  return { repos, picks, entries, guesses };
}

const input = {
  poolId: 'pool1',
  playerId: 'p1',
  weekId: 'w1',
  gameId: 'g1',
  pickedAbbr: 'MIN',
};

describe('a card the player locked', () => {
  function lockedRepos() {
    const stub = stubRepos();
    stub.repos.entries.listByWeek = async () => [
      { id: 'e1', player_id: 'p1', week_id: 'w1', buy_in_cents: 1000, paid_at: null, method: null, confirmed_by: null, locked_at: '2026-09-20T12:00:00.000Z', created_at: '' },
    ];
    return stub;
  }

  it('refuses a pick while the card is locked', async () => {
    const { repos, picks } = lockedRepos();
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:59:00.000Z') }, input),
    ).rejects.toThrow(PickRejectedError);
    expect(picks).toHaveLength(0);
  });

  it('refuses a tiebreak guess while the card is locked', async () => {
    const { repos, guesses } = lockedRepos();
    await expect(
      submitTiebreak({ repos, now: () => new Date('2026-09-20T16:59:00.000Z') }, {
        poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: 44,
      }),
    ).rejects.toThrow(PickRejectedError);
    expect(guesses).toHaveLength(0);
  });

  it('still lets auto-pick fill the gaps at kickoff', async () => {
    // The lock exists to stop a pocket, not the agent. A player who locked a
    // half-finished card still gets it completed rather than scoring zero on
    // the rest.
    const { repos, picks } = lockedRepos();
    await submitPick(
      { repos, now: () => new Date('2026-09-20T17:30:00.000Z') },
      { ...input, isAuto: true, allowLocked: true },
    );
    expect(picks).toHaveLength(1);
  });

  it('lets a player who has not locked carry on', async () => {
    const { repos, picks } = stubRepos();
    await submitPick({ repos, now: () => new Date('2026-09-20T16:59:00.000Z') }, input);
    expect(picks).toHaveLength(1);
  });
});

describe('submitPick against an excluded game', () => {
  it('refuses a pick on a game the week does not count, while the week is open', async () => {
    const { repos, picks } = stubRepos();
    // A second game keeps the week genuinely open, so a refusal here can only
    // mean the exclusion — not the week having no readable deadline. The pick
    // list never renders an excluded game, but the action takes a game id, so
    // the refusal has to live in the service.
    const later = { ...gameRow, id: 'g2', kickoff_at: '2026-09-21T17:00:00.000Z' };
    repos.games.listByWeek = async () => [gameRow, later];
    repos.weekExclusions.listByWeek = async () => ['g1'];

    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input),
    ).rejects.toThrow(PickRejectedError);
    expect(picks).toHaveLength(0);
  });

  it('does not let an excluded early kickoff close the week', async () => {
    const { repos, picks } = stubRepos();
    const early = { ...gameRow, id: 'g0', kickoff_at: '2026-09-16T00:20:00.000Z' };
    repos.games.listByWeek = async () => [early, gameRow];
    repos.weekExclusions.listByWeek = async () => ['g0'];

    // Past the excluded game's kickoff, before the one that counts.
    await submitPick({ repos, now: () => new Date('2026-09-17T12:00:00.000Z') }, input);

    expect(picks).toHaveLength(1);
  });
});

describe('submitPick', () => {
  it('saves a pick before kickoff', async () => {
    const { repos, picks } = stubRepos();
    await submitPick({ repos, now: () => new Date('2026-09-20T16:59:00.000Z') }, input);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ player_id: 'p1', game_id: 'g1', picked_abbr: 'MIN', is_auto: false });
  });

  it('creates the entry on the first pick of the week', async () => {
    const { repos, entries } = stubRepos();
    await submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input);
    expect(entries[0]).toEqual(['p1', 'w1', 1000]);
  });

  it('rejects a pick at kickoff', async () => {
    const { repos, picks } = stubRepos();
    await expect(
      submitPick({ repos, now: () => new Date(KICKOFF) }, input),
    ).rejects.toThrow(PickRejectedError);
    expect(picks).toHaveLength(0);
  });

  it('rejects a pick after kickoff', async () => {
    const { repos } = stubRepos();
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T17:00:01.000Z') }, input),
    ).rejects.toThrow(/locked/i);
  });

  it('allows a locked write when the auto-pick agent asks for it', async () => {
    const { repos, picks } = stubRepos();
    repos.entries.listByWeek = async () => [
      { id: 'en1', player_id: 'p1', week_id: 'w1', buy_in_cents: 1000, paid_at: null, method: null, confirmed_by: null, locked_at: null, created_at: '' },
    ];
    await submitPick(
      { repos, now: () => new Date('2026-09-20T17:30:00.000Z') },
      { ...input, isAuto: true, allowLocked: true },
    );
    expect(picks[0]).toMatchObject({ is_auto: true });
  });

  it('refuses to auto-pick for a player who never joined the week', async () => {
    const { repos, picks, entries } = stubRepos();
    await expect(
      submitPick(
        { repos, now: () => new Date('2026-09-20T16:00:00.000Z') },
        { ...input, isAuto: true },
      ),
    ).rejects.toThrow(/did not join this week/i);
    expect(picks).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('auto-picks for a player who already entered, without creating a second entry', async () => {
    const { repos, picks, entries } = stubRepos();
    repos.entries.listByWeek = async () => [
      { id: 'en1', player_id: 'p1', week_id: 'w1', buy_in_cents: 1000, paid_at: null, method: null, confirmed_by: null, locked_at: null, created_at: '' },
    ];
    await submitPick(
      { repos, now: () => new Date('2026-09-20T16:00:00.000Z') },
      { ...input, isAuto: true },
    );
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ is_auto: true });
    expect(entries).toHaveLength(0);
  });

  it('rejects a team that is not playing in that game', async () => {
    const { repos } = stubRepos();
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, { ...input, pickedAbbr: 'CHI' }),
    ).rejects.toThrow(/not playing/i);
  });

  it('rejects any pick once the week is frozen', async () => {
    const { repos } = stubRepos({ week: { ...weekRow, status: 'frozen' } });
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input),
    ).rejects.toThrow(/frozen/i);
  });

  it('rejects a game that belongs to a different week', async () => {
    const { repos, picks } = stubRepos();
    repos.games.getById = async () => ({ ...gameRow, week: 5 });
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input),
    ).rejects.toThrow(/not part of this week/i);
    expect(picks).toHaveLength(0);
  });

  it('rejects a player who belongs to a different pool', async () => {
    const { repos, picks, entries } = stubRepos();
    repos.players.getById = async () => ({ ...playerRow, pool_id: 'other-pool' });
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input),
    ).rejects.toThrow(/not in this pool/i);
    expect(picks).toHaveLength(0);
    expect(entries).toHaveLength(0);
  });

  it('refuses a pick on a game whose kickoff time is unreadable, rather than never locking it', async () => {
    const { repos, picks } = stubRepos();
    const badGame = { ...gameRow, kickoff_at: 'not-a-date' };
    repos.games.getById = async () => badGame;
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T16:00:00.000Z') }, input),
    ).rejects.toThrow(/unreadable kickoff/i);
    expect(picks).toHaveLength(0);
  });

  it('refuses even the auto-pick agent when the kickoff time is unreadable', async () => {
    const { repos, picks } = stubRepos();
    repos.games.getById = async () => ({ ...gameRow, kickoff_at: 'not-a-date' });
    await expect(
      submitPick(
        { repos, now: () => new Date('2026-09-20T18:00:00.000Z') },
        { ...input, isAuto: true, allowLocked: true },
      ),
    ).rejects.toThrow(/unreadable kickoff/i);
    expect(picks).toHaveLength(0);
  });
});

describe('submitTiebreak', () => {
  it('saves a guess before the tiebreak game kicks off', async () => {
    const { repos, guesses } = stubRepos();
    await submitTiebreak(
      { repos, now: () => new Date('2026-09-20T16:00:00.000Z') },
      { poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: 47 },
    );
    expect(guesses[0]).toEqual(['p1', 'w1', 47]);
  });

  it('rejects a guess after the tiebreak game kicks off', async () => {
    const { repos } = stubRepos();
    await expect(
      submitTiebreak(
        { repos, now: () => new Date('2026-09-20T18:00:00.000Z') },
        { poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: 47 },
      ),
    ).rejects.toThrow(/locked/i);
  });

  it('rejects a negative predicted total', async () => {
    const { repos } = stubRepos();
    await expect(
      submitTiebreak(
        { repos, now: () => new Date('2026-09-20T16:00:00.000Z') },
        { poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: -3 },
      ),
    ).rejects.toThrow(/total/i);
  });

  it('closes with the picks, not at the tiebreak game it describes', async () => {
    // The tiebreak game is the last of the week; the deadline is the first.
    const MONDAY = '2026-09-22T00:15:00.000Z';
    const { repos, guesses } = stubRepos();
    repos.games.listByWeek = async () => [
      { ...gameRow, id: 'g1', kickoff_at: KICKOFF },
      { ...gameRow, id: 'g2', kickoff_at: MONDAY },
    ];

    // Sunday: the first game has kicked off, the tiebreak game has not.
    const sunday = new Date('2026-09-21T00:00:00.000Z');
    expect(sunday.getTime()).toBeGreaterThan(Date.parse(KICKOFF));
    expect(sunday.getTime()).toBeLessThan(Date.parse(MONDAY));

    await expect(
      submitTiebreak(
        { repos, now: () => sunday },
        { poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: 47 },
      ),
    ).rejects.toThrow(/locked/i);
    expect(guesses).toHaveLength(0);
  });

  it("accepts a guess before the week's first kickoff", async () => {
    const { repos, guesses } = stubRepos();
    await submitTiebreak(
      { repos, now: () => new Date('2026-09-20T16:00:00.000Z') },
      { poolId: 'pool1', playerId: 'p1', weekId: 'w1', predictedTotal: 47 },
    );
    expect(guesses).toHaveLength(1);
  });
});

describe('submitPick week deadline', () => {
  it("locks a later game once the week's first game has kicked off", async () => {
    const LATER = '2026-09-21T17:00:00.000Z';
    const { repos, picks } = stubRepos();
    repos.games.listByWeek = async () => [
      { ...gameRow, id: 'g1', kickoff_at: KICKOFF },
      { ...gameRow, id: 'g2', kickoff_at: LATER },
    ];
    repos.games.getById = async () => ({ ...gameRow, id: 'g2', kickoff_at: LATER });

    // Under the old per-game rule this was a legal pick: g2 has not started.
    await expect(
      submitPick(
        { repos, now: () => new Date('2026-09-20T18:00:00.000Z') },
        { ...input, gameId: 'g2' },
      ),
    ).rejects.toThrow(/locked/i);
    expect(picks).toHaveLength(0);
  });

  it('still lets auto-pick write after the deadline', async () => {
    const { repos, picks } = stubRepos();
    repos.entries.listByWeek = async () => [{ player_id: 'p1' } as never];
    await submitPick(
      { repos, now: () => new Date('2026-09-20T18:00:00.000Z') },
      { ...input, isAuto: true, allowLocked: true },
    );
    expect(picks).toHaveLength(1);
  });

  it('respects a commissioner reopening the week', async () => {
    const reopened: WeekRow = { ...weekRow, lock_override: 'open' };
    const { repos, picks } = stubRepos({ week: reopened });
    await submitPick({ repos, now: () => new Date('2026-09-21T00:00:00.000Z') }, input);
    expect(picks).toHaveLength(1);
  });

  it('respects a commissioner closing the week early', async () => {
    const closed: WeekRow = { ...weekRow, lock_override: 'locked' };
    const { repos, picks } = stubRepos({ week: closed });
    await expect(
      submitPick({ repos, now: () => new Date('2026-09-20T12:00:00.000Z') }, input),
    ).rejects.toThrow(/locked/i);
    expect(picks).toHaveLength(0);
  });
});
