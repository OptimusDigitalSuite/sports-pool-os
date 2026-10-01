import { describe, it, expect, vi } from 'vitest';
import { syncWeek, pickTiebreakGameId, MalformedKickoffError } from '@/lib/services/syncSchedule';
import { createManualProvider } from '@/lib/nfl/manualProvider';
import type { NflGame } from '@/lib/nfl/types';
import type { Repositories } from '@/lib/db/repositories';
import type { GameRow, WeekRow } from '@/lib/db/types';

const game = (id: string, kickoff: string): NflGame => ({
  externalId: id,
  season: 2026,
  week: 3,
  homeTeam: 'Minnesota Vikings',
  awayTeam: 'Green Bay Packers',
  homeAbbr: 'MIN',
  awayAbbr: 'GB',
  kickoffAt: kickoff,
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
});

function stubRepos(storedGames: GameRow[]): { repos: Repositories; upserted: unknown[]; weekArgs: unknown[] } {
  const upserted: unknown[] = [];
  const weekArgs: unknown[] = [];
  const repos = {
    pools: { get: async () => null },
    players: { listActive: async () => [], getByToken: async () => null },
    games: {
      listByWeek: async () => storedGames,
      getById: async () => null,
      upsertMany: async (games: unknown) => { upserted.push(games); },
    },
    weeks: {
      find: async () => null,
      getById: async () => null,
      upsert: async (poolId: string, season: number, weekNumber: number, tiebreakGameId: string | null) => {
        weekArgs.push({ poolId, season, weekNumber, tiebreakGameId });
        return { id: 'w1', pool_id: poolId, season, week_number: weekNumber, tiebreak_game_id: tiebreakGameId, status: 'open', frozen_at: null, created_at: '' } as WeekRow;
      },
    },
    picks: { listByWeek: async () => [], upsert: async () => {} },
    guesses: { listByWeek: async () => [], upsert: async () => {} },
    entries: { listByWeek: async () => [], ensure: async () => {}, markPaid: async () => {} },
  } as unknown as Repositories;
  return { repos, upserted, weekArgs };
}

const row = (id: string, externalId: string, kickoff: string): GameRow => ({
  id,
  external_id: externalId,
  season: 2026,
  week: 3,
  home_team: 'Minnesota Vikings',
  away_team: 'Green Bay Packers',
  home_abbr: 'MIN',
  away_abbr: 'GB',
  kickoff_at: kickoff,
  home_score: null,
  away_score: null,
  status: 'scheduled',
  updated_at: '',
});

describe('syncWeek', () => {
  it('writes the fetched games and returns them', async () => {
    const provider = createManualProvider([game('e1', '2026-09-20T17:00:00.000Z')]);
    const { repos, upserted } = stubRepos([row('g1', 'e1', '2026-09-20T17:00:00.000Z')]);
    const result = await syncWeek({ repos, provider }, 'pool1', 2026, 3);
    expect(upserted).toHaveLength(1);
    expect(result.games).toHaveLength(1);
  });

  it('picks the latest kickoff as the tiebreak game', async () => {
    const provider = createManualProvider([
      game('e1', '2026-09-20T17:00:00.000Z'),
      game('e2', '2026-09-22T00:15:00.000Z'),
      game('e3', '2026-09-20T20:25:00.000Z'),
    ]);
    const { repos, weekArgs } = stubRepos([
      row('g1', 'e1', '2026-09-20T17:00:00.000Z'),
      row('g2', 'e2', '2026-09-22T00:15:00.000Z'),
      row('g3', 'e3', '2026-09-20T20:25:00.000Z'),
    ]);
    const result = await syncWeek({ repos, provider }, 'pool1', 2026, 3);
    expect((weekArgs[0] as { tiebreakGameId: string }).tiebreakGameId).toBe('g2');
    expect(result.week.tiebreak_game_id).toBe('g2');
  });

  it('leaves the tiebreak game null when the week has no games', async () => {
    const provider = createManualProvider([]);
    const { repos, weekArgs } = stubRepos([]);
    await syncWeek({ repos, provider }, 'pool1', 2026, 3);
    expect((weekArgs[0] as { tiebreakGameId: string | null }).tiebreakGameId).toBeNull();
  });

  it('surfaces a provider failure instead of writing a half-synced week', async () => {
    const provider = { name: 'espn' as const, fetchWeek: vi.fn().mockRejectedValue(new Error('EspnUnavailable: 503')) };
    const { repos, upserted } = stubRepos([]);
    await expect(syncWeek({ repos, provider }, 'pool1', 2026, 3)).rejects.toThrow(/EspnUnavailable/);
    expect(upserted).toHaveLength(0);
  });

  it('rejects a malformed kickoff before writing anything', async () => {
    const provider = createManualProvider([game('e1', 'not-a-date')]);
    const { repos, upserted } = stubRepos([]);
    await expect(syncWeek({ repos, provider }, 'pool1', 2026, 3)).rejects.toThrow(MalformedKickoffError);
    expect(upserted).toHaveLength(0);
  });

  it('refuses to re-sync a frozen week, so an already-paid week cannot have its tiebreak game rewritten', async () => {
    const provider = createManualProvider([game('e1', '2026-09-20T17:00:00.000Z')]);
    const { repos, weekArgs, upserted } = stubRepos([row('g1', 'e1', '2026-09-20T17:00:00.000Z')]);
    repos.weeks.find = async () => ({
      id: 'w1',
      pool_id: 'pool1',
      season: 2026,
      week_number: 3,
      tiebreak_game_id: 'g1',
      lock_override: null,
      status: 'frozen',
      frozen_at: '2026-09-21T00:00:00.000Z',
      created_at: '',
    });
    await expect(syncWeek({ repos, provider }, 'pool1', 2026, 3)).rejects.toThrow(/frozen/i);
    expect(weekArgs).toHaveLength(0);
    expect(upserted).toHaveLength(0);
  });
});

describe('pickTiebreakGameId', () => {
  it('returns null for a week with no games', () => {
    expect(pickTiebreakGameId([])).toBeNull();
  });

  it('returns the only game when the week has one', () => {
    expect(pickTiebreakGameId([row('g1', 'e1', '2026-09-20T17:00:00.000Z')])).toBe('g1');
  });

  it('returns the latest kickoff regardless of array order', () => {
    expect(
      pickTiebreakGameId([
        row('g2', 'e2', '2026-09-22T00:15:00.000Z'),
        row('g1', 'e1', '2026-09-20T17:00:00.000Z'),
        row('g3', 'e3', '2026-09-20T20:25:00.000Z'),
      ]),
    ).toBe('g2');
  });

  it('breaks a kickoff tie on the lowest game id, not on array order', () => {
    const kickoff = '2026-09-22T00:15:00.000Z';
    expect(pickTiebreakGameId([row('gz', 'e1', kickoff), row('ga', 'e2', kickoff)])).toBe('ga');
    expect(pickTiebreakGameId([row('ga', 'e2', kickoff), row('gz', 'e1', kickoff)])).toBe('ga');
  });

  it('throws when the FIRST game has an unparseable kickoff, instead of letting it win', () => {
    expect(() =>
      pickTiebreakGameId([
        row('bad', 'e1', 'not-a-date'),
        row('g2', 'e2', '2026-09-22T00:15:00.000Z'),
      ]),
    ).toThrow(MalformedKickoffError);
  });

  it('throws when a LATER game has an unparseable kickoff, instead of skipping it', () => {
    expect(() =>
      pickTiebreakGameId([
        row('g1', 'e1', '2026-09-20T17:00:00.000Z'),
        row('bad', 'e2', 'not-a-date'),
      ]),
    ).toThrow(MalformedKickoffError);
  });
});
