import { parseEspnScoreboard } from '@/lib/nfl/parseEspn';
import type { NflDataProvider } from '@/lib/nfl/types';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

export class EspnUnavailableError extends Error {
  constructor(status: number) {
    super(`EspnUnavailable: upstream responded ${status}`);
    this.name = 'EspnUnavailableError';
  }
}

export function createEspnProvider(fetchImpl: typeof fetch = fetch): NflDataProvider {
  return {
    name: 'espn',
    async fetchWeek(season, week) {
      const url = `${BASE}?dates=${season}&seasontype=2&week=${week}`;
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new EspnUnavailableError(response.status);
      return parseEspnScoreboard(await response.json(), season, week);
    },
  };
}
