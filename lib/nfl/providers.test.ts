import { describe, it, expect } from 'vitest';
import { createEspnProvider } from '@/lib/nfl/espnProvider';
import { createManualProvider } from '@/lib/nfl/manualProvider';
import type { NflGame } from '@/lib/nfl/types';

const sampleGame: NflGame = {
  externalId: 'm1',
  season: 2026,
  week: 3,
  homeTeam: 'Minnesota Vikings',
  awayTeam: 'Green Bay Packers',
  homeAbbr: 'MIN',
  awayAbbr: 'GB',
  kickoffAt: '2026-09-20T17:00:00.000Z',
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
};

describe('createEspnProvider', () => {
  it('requests the right URL and returns parsed games', async () => {
    let requested = '';
    const provider = createEspnProvider(async (url) => {
      requested = String(url);
      return new Response(
        JSON.stringify({
          events: [
            {
              id: 'e9',
              date: '2026-09-20T17:00Z',
              competitions: [
                {
                  competitors: [
                    { homeAway: 'home', score: '0', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN' } },
                    { homeAway: 'away', score: '0', team: { displayName: 'Green Bay Packers', abbreviation: 'GB' } },
                  ],
                  status: { type: { state: 'pre', completed: false } },
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    });

    const games = await provider.fetchWeek(2026, 3);
    expect(requested).toContain('dates=2026');
    expect(requested).toContain('week=3');
    expect(requested).toContain('seasontype=2');
    expect(games).toHaveLength(1);
    expect(games[0]!.homeAbbr).toBe('MIN');
  });

  it('throws when the upstream responds with an error status', async () => {
    const provider = createEspnProvider(async () => new Response('nope', { status: 503 }));
    await expect(provider.fetchWeek(2026, 3)).rejects.toThrow(/EspnUnavailable/);
  });
});

describe('createManualProvider', () => {
  it('returns only the games matching the requested season and week', async () => {
    const provider = createManualProvider([
      sampleGame,
      { ...sampleGame, externalId: 'm2', week: 4 },
    ]);
    const games = await provider.fetchWeek(2026, 3);
    expect(games).toHaveLength(1);
    expect(games[0]!.externalId).toBe('m1');
  });
});
