import { describe, it, expect } from 'vitest';
import { revealPicks } from '@/lib/ui/revealPicks';
import type { GameRow, PickRow, PlayerRow } from '@/lib/db/types';

const game = (id: string, away: string, home: string): GameRow => ({
  id,
  external_id: `e-${id}`,
  season: 2026,
  week: 1,
  home_team: `${home} Home`,
  away_team: `${away} Away`,
  home_abbr: home,
  away_abbr: away,
  kickoff_at: '2026-09-10T00:20:00.000Z',
  home_score: null,
  away_score: null,
  status: 'scheduled',
  updated_at: '',
});

const player = (id: string, name: string): PlayerRow => ({
  id,
  pool_id: 'pool1',
  name,
  email: null,
  phone: null,
  magic_token: `tok-${id}`,
  is_commissioner: false,
  is_active: true,
  created_at: '',
});

const pick = (playerId: string, gameId: string, abbr: string): PickRow => ({
  id: `${playerId}-${gameId}`,
  player_id: playerId,
  week_id: 'w1',
  game_id: gameId,
  picked_abbr: abbr,
  is_auto: false,
  created_at: '',
  updated_at: '',
});

const games = [game('g1', 'NE', 'SEA')];
const players = [player('p1', 'Zoe'), player('p2', 'Bill'), player('p3', 'Ada')];
const entered = new Set(['p1', 'p2', 'p3']);

describe('revealPicks', () => {
  it('splits entrants by the side they took', () => {
    const [row] = revealPicks(
      games,
      players,
      [pick('p1', 'g1', 'NE'), pick('p2', 'g1', 'SEA'), pick('p3', 'g1', 'SEA')],
      entered,
    );
    expect(row!.away).toEqual(['Zoe']);
    expect(row!.home).toEqual(['Ada', 'Bill']);
    expect(row!.missing).toEqual([]);
  });

  it('sorts names alphabetically, not by pick order', () => {
    const [row] = revealPicks(
      games,
      players,
      [pick('p1', 'g1', 'SEA'), pick('p2', 'g1', 'SEA'), pick('p3', 'g1', 'SEA')],
      entered,
    );
    expect(row!.home).toEqual(['Ada', 'Bill', 'Zoe']);
  });

  it('lists an entrant who left the game blank as missing', () => {
    const [row] = revealPicks(games, players, [pick('p1', 'g1', 'NE')], entered);
    expect(row!.away).toEqual(['Zoe']);
    expect(row!.missing).toEqual(['Ada', 'Bill']);
  });

  it('omits players who never entered the week', () => {
    // Sitting out is not the same as forgetting to pick. Listing a
    // non-entrant under every game would bury the people who actually
    // left one blank.
    const [row] = revealPicks(games, players, [pick('p1', 'g1', 'NE')], new Set(['p1']));
    expect(row!.away).toEqual(['Zoe']);
    expect(row!.missing).toEqual([]);
  });

  it('drops a pick naming a team that is not in the game', () => {
    const [row] = revealPicks(games, players, [pick('p1', 'g1', 'GB')], new Set(['p1']));
    expect(row!.away).toEqual([]);
    expect(row!.home).toEqual([]);
    expect(row!.missing).toEqual(['Zoe']);
  });

  it('returns one row per game, in schedule order', () => {
    const rows = revealPicks(
      [game('g1', 'NE', 'SEA'), game('g2', 'GB', 'MIN')],
      players,
      [],
      entered,
    );
    expect(rows.map((r) => r.gameId)).toEqual(['g1', 'g2']);
  });
});
