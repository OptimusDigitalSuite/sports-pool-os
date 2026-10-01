import { describe, it, expect, vi } from 'vitest';
import { generateRecap } from '@/lib/recap/generate';

const input = {
  weekNumber: 3,
  potCents: 3000,
  rows: [
    { name: 'Bill', correct: 11, incorrect: 2, rank: 1, payoutCents: 3000, tiebreakDelta: 1, autoPicks: 0 },
    { name: 'Kenneth', correct: 4, incorrect: 9, rank: 2, payoutCents: 0, tiebreakDelta: 20, autoPicks: 5 },
  ],
};

function clientReturning(content: unknown, stopReason = 'end_turn') {
  return { beta: { messages: { create: vi.fn().mockResolvedValue({ content, stop_reason: stopReason, model: 'claude-opus-5' }) } } };
}

describe('generateRecap', () => {
  it('returns the model text when the call succeeds', async () => {
    const client = clientReturning([{ type: 'text', text: 'Bill ran away with it. Kenneth, we need to talk.' }]);
    const text = await generateRecap({ client }, input);
    expect(text).toBe('Bill ran away with it. Kenneth, we need to talk.');
  });

  it('sends the model id and effort the spec requires', async () => {
    const client = clientReturning([{ type: 'text', text: 'ok' }]);
    await generateRecap({ client }, input);
    const params = client.beta.messages.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.model).toBe('claude-opus-5');
    expect(params.output_config).toMatchObject({ effort: 'low' });
    expect(params).not.toHaveProperty('budget_tokens');
  });

  it('falls back to the plain summary when the model refuses', async () => {
    const client = clientReturning([], 'refusal');
    const text = await generateRecap({ client }, input);
    expect(text).toContain('Week 3');
    expect(text).toContain('Bill');
  });

  it('falls back to the plain summary when the call throws', async () => {
    const client = { beta: { messages: { create: vi.fn().mockRejectedValue(new Error('rate limited')) } } };
    const text = await generateRecap({ client }, input);
    expect(text).toContain('Week 3');
  });

  it('falls back when the response carries no text block', async () => {
    const client = clientReturning([{ type: 'thinking', thinking: '' }]);
    const text = await generateRecap({ client }, input);
    expect(text).toContain('Week 3');
  });

  it('reports the real error to onDegraded when the call throws, rather than hiding it', async () => {
    const client = { beta: { messages: { create: vi.fn().mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'text')")) } } };
    const onDegraded = vi.fn();
    const text = await generateRecap({ client, onDegraded }, input);
    expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining("Cannot read properties of undefined"));
    expect(text).toContain('Week 3');
  });

  it('reports a refusal to onDegraded', async () => {
    const client = clientReturning([], 'refusal');
    const onDegraded = vi.fn();
    await generateRecap({ client, onDegraded }, input);
    expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining('refusal'));
  });

  it('reports an empty response to onDegraded', async () => {
    const client = clientReturning([{ type: 'thinking', thinking: '' }]);
    const onDegraded = vi.fn();
    await generateRecap({ client, onDegraded }, input);
    expect(onDegraded).toHaveBeenCalledWith(expect.stringContaining('empty response'));
  });

  it('never throws even when onDegraded itself is omitted', async () => {
    const client = { beta: { messages: { create: vi.fn().mockRejectedValue(new Error('boom')) } } };
    await expect(generateRecap({ client }, input)).resolves.toContain('Week 3');
  });
});
