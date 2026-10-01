import type { Action, Agent, TickState } from '@/lib/agents/types';

/**
 * Asks for the weekly writeup once the week is settled. Generation itself is
 * I/O and belongs to the executor — this agent only decides that the moment
 * has arrived. The executor's notification dedupe key stops it being written
 * twice.
 */
export const recap: Agent = {
  name: 'recap',
  decide(state: TickState): Action[] {
    // A synthetic bootstrap week (no id) has no schedule and no entries yet;
    // there is nothing to write a recap about.
    if (state.week.id === '') return [];
    if (state.week.status !== 'frozen') return [];
    if (state.results.length === 0) return [];
    return [{ type: 'generate_recap', weekId: state.week.id }];
  },
};
