import { autopick } from '@/lib/agents/autopick';
import { commissioner } from '@/lib/agents/commissioner';
import { recap } from '@/lib/agents/recap';
import { tickRunKey } from '@/lib/agents/runKey';
import { scorekeeper } from '@/lib/agents/scorekeeper';
import type { Action, Agent, TickState } from '@/lib/agents/types';
import type { ExecutionReport } from '@/lib/agents/executor';
import type { Repositories } from '@/lib/db/repositories';

const AGENTS: Agent[] = [scorekeeper, autopick, commissioner, recap];

export interface TickDeps {
  repos: Repositories;
  loadState(poolId: string, now: Date): Promise<TickState | null>;
  execute(state: TickState, actions: Action[]): Promise<ExecutionReport>;
  now(): Date;
}

export interface TickReport {
  claimed: boolean;
  actions: number;
  execution: ExecutionReport | null;
}

/**
 * One five-minute pass over a pool.
 *
 * The run key is claimed first, so an overlapping cron fire or a hammered
 * Force Tick button does nothing rather than acting twice. Agents then decide
 * against a single snapshot of state — they all see the same instant — and
 * the executor performs what they returned.
 */
export async function runTick(deps: TickDeps, poolId: string): Promise<TickReport> {
  const now = deps.now();
  const claimed = await deps.repos.agentRuns.claim(poolId, 'tick', tickRunKey('tick', poolId, now));
  if (!claimed) return { claimed: false, actions: 0, execution: null };

  const state = await deps.loadState(poolId, now);
  if (!state) return { claimed: true, actions: 0, execution: null };

  const actions = AGENTS.flatMap((agent) => agent.decide(state));
  if (actions.length === 0) return { claimed: true, actions: 0, execution: null };

  const execution = await deps.execute(state, actions);
  return { claimed: true, actions: actions.length, execution };
}
