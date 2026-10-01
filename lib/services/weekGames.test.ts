import { describe, it, expect, vi } from 'vitest';
import { gamesInWeek, withoutExcluded } from '@/lib/services/weekGames';
import type { Repositories } from '@/lib/db/repositories';
import type { GameRow } from '@/lib/db/types';

function game(id: string, kickoff: string): GameRow {
  return {
    id,
    external_id: `ext-${id}`,
    season: 2026,
    week: 1,
    home_team: 'Home',
    away_team: 'Away',
    home_abbr: 'HME',
    away_abbr: 'AWY',
    kickoff_at: kickoff,
    home_score: null,
    away_score: null,
    status: 'scheduled',
    updated_at: '',
  };
}

const opener = game('g1', '2026-09-10T00:20:00.000Z');
const melbourne = game('g2', '2026-09-11T00:35:00.000Z');
const sunday = game('g3', '2026-09-13T17:00:00.000Z');

describe('withoutExcluded', () => {
  it('drops the excluded games and keeps the rest', () => {
    expect(withoutExcluded([opener, melbourne, sunday], ['g1', 'g2'])).toEqual([sunday]);
  });

  it('is a no-op when nothing is excluded', () => {
    expect(withoutExcluded([opener, sunday], [])).toEqual([opener, sunday]);
  });

  it('ignores an exclusion for a game that is not in the week', () => {
    expect(withoutExcluded([sunday], ['g9'])).toEqual([sunday]);
  });
});

describe('gamesInWeek', () => {
  it('returns only the games that count, so the deadline follows them', async () => {
    const repos = {
      games: { listByWeek: vi.fn().mockResolvedValue([opener, melbourne, sunday]) },
      weekExclusions: { listByWeek: vi.fn().mockResolvedValue(['g1', 'g2']) },
    } as unknown as Repositories;

    const games = await gamesInWeek(repos, { id: 'w1', season: 2026, week_number: 1 });

    expect(games.map((g) => g.id)).toEqual(['g3']);
    expect(repos.games.listByWeek).toHaveBeenCalledWith(2026, 1);
    expect(repos.weekExclusions.listByWeek).toHaveBeenCalledWith('w1');
  });
});
