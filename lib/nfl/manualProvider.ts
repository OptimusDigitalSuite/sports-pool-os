import type { NflDataProvider, NflGame } from '@/lib/nfl/types';

/**
 * Commissioner-entered games. The escape hatch for when ESPN changes shape
 * or goes down mid-week: the pool keeps running on hand-entered scores.
 */
export function createManualProvider(games: NflGame[]): NflDataProvider {
  return {
    name: 'manual',
    async fetchWeek(season, week) {
      return games.filter((g) => g.season === season && g.week === week);
    },
  };
}
