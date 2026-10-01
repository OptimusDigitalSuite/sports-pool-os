import type { NotifyChannel, OutboundMessage } from '@/lib/notify/types';

export interface NoopChannel extends NotifyChannel {
  readonly sent: OutboundMessage[];
}

export function createNoopChannel(): NoopChannel {
  const sent: OutboundMessage[] = [];
  return {
    name: 'noop',
    sent,
    async send(message) {
      sent.push(message);
      return { ok: true };
    },
  };
}
