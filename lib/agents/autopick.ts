import type { Action, Agent, TickState } from '@/lib/agents/types';
import { weekLockAtMs } from '@/lib/services/weekLock';

export const AUTOPICK_LEAD_MS = 15 * 60 * 1000;

// A worst case of many entrants x many games can produce hundreds of
// sequential auto-pick actions in a single tick, each doing several database
// round trips. Cap what one tick performs; the remainder is picked up by the
// following tick, which is safe because submitPick is idempotent.
export const AUTOPICK_MAX_PER_TICK = 40;

/**
 * Fills the home team for anyone who joined the week but has not picked
 * before the week's deadline, so a missed deadline costs them a coin-flip
 * rather than a zero.
 *
 * The pool locks the whole week at its first kickoff, so this fires once,
 * shortly before that, and fills every unpicked game at the same time —
 * rather than trailing each game to its own kickoff, which would have kept
 * filling Sunday games hours after picks had actually closed.
 *
 * It only ever covers players who already have an entry — auto-pick must
 * never put someone who sat the week out on the hook for the buy-in. A game
 * with an unreadable kickoff is skipped rather than guessed at; the pick
 * submission layer would reject it anyway.
 */
export const autopick: Agent = {
  name: 'autopick',
  decide(state: TickState): Action[] {
    // A synthetic bootstrap week (no id) has no schedule and no entries yet;
    // there is nothing to auto-pick.
    if (state.week.id === '') return [];
    if (!state.pool.settings.autopick_enabled) return [];
    if (state.week.status === 'frozen') return [];

    const entered = new Set(state.entries.map((entry) => entry.player_id));
    const eligible = state.players.filter((p) => p.is_active && entered.has(p.id));
    if (eligible.length === 0) return [];

    // One deadline for the week, so one moment to fill against.
    const lockAt = weekLockAtMs(state.games.map((game) => game.kickoff_at));
    if (lockAt === null) return [];
    if (lockAt > state.now.getTime() + AUTOPICK_LEAD_MS) return [];

    const picked = new Set(state.picks.map((pick) => `${pick.player_id}:${pick.game_id}`));

    const actions: Action[] = [];
    for (const player of eligible) {
      for (const game of state.games) {
        // A game whose kickoff cannot be read is skipped, not guessed at —
        // submitPick would reject the write anyway.
        if (Number.isNaN(Date.parse(game.kickoff_at))) continue;
        if (picked.has(`${player.id}:${game.id}`)) continue;
        actions.push({
          type: 'auto_pick',
          playerId: player.id,
          weekId: state.week.id,
          gameId: game.id,
          pickedAbbr: game.home_abbr,
        });
      }
    }
    return actions.slice(0, AUTOPICK_MAX_PER_TICK);
  },
};
