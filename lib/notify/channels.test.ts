import { describe, it, expect, vi } from 'vitest';
import { createResendChannel } from '@/lib/notify/resend';
import { createSmsChannel } from '@/lib/notify/sms';
import { createNoopChannel } from '@/lib/notify/noop';

describe('createResendChannel', () => {
  it('sends through the injected client and reports success', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null });
    const channel = createResendChannel({ from: 'pool@sports-pool-os.test', client: { emails: { send } } });
    const result = await channel.send({ to: 'bill@x.test', subject: 'Picks are open', body: 'Week 3 is live.' });
    expect(result).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      from: 'pool@sports-pool-os.test',
      to: 'bill@x.test',
      subject: 'Picks are open',
      text: 'Week 3 is live.',
    });
  });

  it('returns a failure value rather than throwing when the provider errors', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    const channel = createResendChannel({ from: 'pool@sports-pool-os.test', client: { emails: { send } } });
    expect(await channel.send({ to: 'a@x.test', subject: 's', body: 'b' })).toEqual({
      ok: false,
      reason: 'domain not verified',
    });
  });

  it('returns a failure value rather than throwing when the client blows up', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'));
    const channel = createResendChannel({ from: 'pool@sports-pool-os.test', client: { emails: { send } } });
    expect(await channel.send({ to: 'a@x.test', subject: 's', body: 'b' })).toEqual({
      ok: false,
      reason: 'network down',
    });
  });
});

describe('createSmsChannel', () => {
  it('reports that SMS is not enabled yet, without throwing', async () => {
    const result = await createSmsChannel().send({ to: '+15551234567', subject: 's', body: 'b' });
    expect(result).toEqual({ ok: false, reason: 'sms channel is not configured yet' });
  });
});

describe('createNoopChannel', () => {
  it('records messages instead of sending them', async () => {
    const channel = createNoopChannel();
    await channel.send({ to: 'a@x.test', subject: 's', body: 'b' });
    expect(channel.sent).toEqual([{ to: 'a@x.test', subject: 's', body: 'b' }]);
  });
});
