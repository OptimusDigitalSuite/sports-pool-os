import type { AgentName } from '@/lib/agents/types';

const BUCKET_MS = 5 * 60 * 1000;

/**
 * A key that is stable within one five-minute tick and unique across agents
 * and pools. `agent_runs.run_key` is unique, so a second fire inside the same
 * bucket — an overlapping cron, a manual Force Tick, a retry — loses the
 * insert and skips instead of acting twice.
 */
export function tickRunKey(agent: AgentName | 'tick', poolId: string, now: Date): string {
  return `${agent}:${poolId}:${Math.floor(now.getTime() / BUCKET_MS)}`;
}
