import { describe, it, expect, vi } from 'vitest';
import { runTick } from '@/lib/agents/tick';

function deps(claim = true) {
  return {
    repos: { agentRuns: { claim: vi.fn().mockResolvedValue(claim) } },
    loadState: vi.fn().mockResolvedValue(null),
    execute: vi.fn(),
    now: () => new Date('2026-09-20T16:00:00.000Z'),
  } as never;
}

describe('runTick', () => {
  it('skips entirely when another tick already claimed this bucket', async () => {
    const d = deps(false);
    const report = await runTick(d, 'pool1');
    expect(report.claimed).toBe(false);
    expect((d as unknown as { loadState: ReturnType<typeof vi.fn> }).loadState).not.toHaveBeenCalled();
  });

  it('does nothing when there is no open week', async () => {
    const d = deps(true);
    const report = await runTick(d, 'pool1');
    expect(report.claimed).toBe(true);
    expect(report.actions).toBe(0);
  });
});
