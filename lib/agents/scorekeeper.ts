import type { Action, Agent, TickState } from '@/lib/agents/types';
import type { GameRow } from '@/lib/db/types';

function isSettled(game: GameRow): boolean {
  return game.status === 'final' && game.home_score !== null && game.away_score !== null;
}

export const REGULAR_SEASON_WEEKS = 18;

/**
 * Watches the week, requests fresh scores while anything is still
 * unsettled, freezes it the moment every game has a real final score, and
 * once frozen opens the next one — so the pool walks the regular season on
 * its own instead of stopping dead after the week that happens to exist.
 * A game marked final with null scores does not count as settled — a
 * provider hiccup must not freeze a week early and pay the wrong person.
 *
 * Grading itself needs no agent: standings are derived from picks and games
 * on demand. Freezing is the only irreversible step, so it and advancing to
 * the next week are the only decisions this agent makes beyond asking for a
 * sync.
 */
export const scorekeeper: Agent = {
  name: 'scorekeeper',
  decide(state: TickState): Action[] {
    // A frozen week is done. Open the next one once its last kickoff has
    // passed, so the pool walks the regular season on its own instead of
    // stopping dead after week 1.
    if (state.week.status === 'frozen') {
      if (state.week.week_number >= REGULAR_SEASON_WEEKS) return [];
      const lastKickoff = state.games.reduce((latest, game) => {
        const time = Date.parse(game.kickoff_at);
        return Number.isNaN(time) ? latest : Math.max(latest, time);
      }, Number.NEGATIVE_INFINITY);
      if (lastKickoff === Number.NEGATIVE_INFINITY || state.now.getTime() < lastKickoff) return [];
      return [
        { type: 'sync_week', season: state.week.season, weekNumber: state.week.week_number + 1 },
      ];
    }

    // Ask for fresh scores whenever anything is still unsettled. This is the
    // ingestion trigger for the whole system: without it nothing moves off
    // 'scheduled' and no week can ever freeze.
    if (state.games.length === 0 || !state.games.every(isSettled)) {
      return [{ type: 'sync_week', season: state.week.season, weekNumber: state.week.week_number }];
    }

    return [{ type: 'freeze_week', weekId: state.week.id }];
  },
};
