import { describe, it, expect } from 'vitest';
import { tickRunKey } from '@/lib/agents/runKey';

describe('tickRunKey', () => {
  it('is identical for two moments in the same five-minute bucket', () => {
    const a = tickRunKey('scorekeeper', 'pool1', new Date('2026-09-20T17:01:00.000Z'));
    const b = tickRunKey('scorekeeper', 'pool1', new Date('2026-09-20T17:04:59.000Z'));
    expect(a).toBe(b);
  });

  it('differs across bucket boundaries', () => {
    const a = tickRunKey('scorekeeper', 'pool1', new Date('2026-09-20T17:04:59.000Z'));
    const b = tickRunKey('scorekeeper', 'pool1', new Date('2026-09-20T17:05:00.000Z'));
    expect(a).not.toBe(b);
  });

  it('differs by agent and by pool', () => {
    const when = new Date('2026-09-20T17:01:00.000Z');
    expect(tickRunKey('scorekeeper', 'pool1', when)).not.toBe(tickRunKey('autopick', 'pool1', when));
    expect(tickRunKey('scorekeeper', 'pool1', when)).not.toBe(tickRunKey('scorekeeper', 'pool2', when));
  });

  it('is a readable agent:pool:bucket string', () => {
    const key = tickRunKey('recap', 'pool1', new Date('2026-09-20T17:00:00.000Z'));
    expect(key).toMatch(/^recap:pool1:\d+$/);
  });

  it('accepts the whole-tick claim name as well as an agent name', () => {
    expect(tickRunKey('tick', 'pool1', new Date('2026-09-20T17:00:00.000Z'))).toMatch(
      /^tick:pool1:\d+$/,
    );
  });
});
