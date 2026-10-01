import { describe, it, expect } from 'vitest';
import { parseEspnScoreboard } from '@/lib/nfl/parseEspn';
import fixture from '@/lib/nfl/fixtures/scoreboard-week1.json';

describe('parseEspnScoreboard', () => {
  it('maps events to NflGame records', () => {
    const games = parseEspnScoreboard(fixture, 2025, 1);
    expect(games.length).toBeGreaterThan(0);
    const first = games[0]!;
    expect(first.season).toBe(2025);
    expect(first.week).toBe(1);
    expect(first.homeAbbr).toMatch(/^[A-Z]{2,4}$/);
    expect(first.awayAbbr).toMatch(/^[A-Z]{2,4}$/);
    expect(first.kickoffAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('marks a completed game final and carries its scores', () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: 'e1',
            date: '2025-09-05T00:20Z',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', score: '27', team: { displayName: 'Philadelphia Eagles', abbreviation: 'PHI' } },
                  { homeAway: 'away', score: '24', team: { displayName: 'Dallas Cowboys', abbreviation: 'DAL' } },
                ],
                status: { type: { state: 'post', completed: true } },
              },
            ],
          },
        ],
      },
      2025,
      1,
    );
    expect(games[0]).toEqual({
      externalId: 'e1',
      season: 2025,
      week: 1,
      homeTeam: 'Philadelphia Eagles',
      awayTeam: 'Dallas Cowboys',
      homeAbbr: 'PHI',
      awayAbbr: 'DAL',
      kickoffAt: '2025-09-05T00:20:00.000Z',
      homeScore: 27,
      awayScore: 24,
      status: 'final',
    });
  });

  it('reports a scheduled game with null scores rather than zeros', () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: 'e2',
            date: '2025-09-07T17:00Z',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', score: '0', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN' } },
                  { homeAway: 'away', score: '0', team: { displayName: 'Chicago Bears', abbreviation: 'CHI' } },
                ],
                status: { type: { state: 'pre', completed: false } },
              },
            ],
          },
        ],
      },
      2025,
      1,
    );
    expect(games[0]!.status).toBe('scheduled');
    expect(games[0]!.homeScore).toBeNull();
    expect(games[0]!.awayScore).toBeNull();
  });

  it('throws a named error when the payload shape is wrong', () => {
    expect(() => parseEspnScoreboard({ nope: true }, 2025, 1)).toThrow(/EspnSchemaError/);
  });

  it('throws rather than inventing a NaN score when a final game has a non-numeric score', () => {
    expect(() =>
      parseEspnScoreboard(
        {
          events: [
            {
              id: 'bad1',
              date: '2025-09-05T00:20Z',
              competitions: [
                {
                  competitors: [
                    { homeAway: 'home', score: '', team: { displayName: 'Philadelphia Eagles', abbreviation: 'PHI' } },
                    { homeAway: 'away', score: '24', team: { displayName: 'Dallas Cowboys', abbreviation: 'DAL' } },
                  ],
                  status: { type: { state: 'post', completed: true } },
                },
              ],
            },
          ],
        },
        2025,
        1,
      ),
    ).toThrow(/EspnSchemaError.*non-numeric home score/);
  });

  it('throws a named error rather than a bare RangeError when the date is unparseable', () => {
    expect(() =>
      parseEspnScoreboard(
        {
          events: [
            {
              id: 'badDate1',
              date: 'not-a-date',
              competitions: [
                {
                  competitors: [
                    { homeAway: 'home', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN' } },
                    { homeAway: 'away', team: { displayName: 'Chicago Bears', abbreviation: 'CHI' } },
                  ],
                  status: { type: { state: 'pre', completed: false } },
                },
              ],
            },
          ],
        },
        2025,
        1,
      ),
    ).toThrow(/EspnSchemaError.*unparseable date/);
  });

  it('treats a postponed game as scheduled, not as a 0-0 final', () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: 'pp1',
            date: '2026-09-20T17:00Z',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', score: '0', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN' } },
                  { homeAway: 'away', score: '0', team: { displayName: 'Green Bay Packers', abbreviation: 'GB' } },
                ],
                status: { type: { state: 'post', completed: false, name: 'STATUS_POSTPONED' } },
              },
            ],
          },
        ],
      },
      2026,
      3,
    );
    expect(games[0]!.status).toBe('scheduled');
    expect(games[0]!.homeScore).toBeNull();
    expect(games[0]!.awayScore).toBeNull();
  });

  it('treats an unfinished post-state game as scheduled even without a status name', () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: 'pp2',
            date: '2026-09-20T17:00Z',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', score: '0', team: { displayName: 'Chicago Bears', abbreviation: 'CHI' } },
                  { homeAway: 'away', score: '0', team: { displayName: 'Detroit Lions', abbreviation: 'DET' } },
                ],
                status: { type: { state: 'post', completed: false } },
              },
            ],
          },
        ],
      },
      2026,
      3,
    );
    expect(games[0]!.status).toBe('scheduled');
  });

  it('still parses a scheduled game whose score is absent entirely', () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: 'pre1',
            date: '2025-09-07T17:00Z',
            competitions: [
              {
                competitors: [
                  { homeAway: 'home', team: { displayName: 'Minnesota Vikings', abbreviation: 'MIN' } },
                  { homeAway: 'away', team: { displayName: 'Chicago Bears', abbreviation: 'CHI' } },
                ],
                status: { type: { state: 'pre', completed: false } },
              },
            ],
          },
        ],
      },
      2025,
      1,
    );
    expect(games[0]!.status).toBe('scheduled');
    expect(games[0]!.homeScore).toBeNull();
  });
});
