import type { NotifyChannel } from '@/lib/notify/types';

/**
 * Placeholder for SMS, which waits on the LLC and A2P 10DLC registration.
 * It exists so switching channels later is a config change rather than a
 * refactor — and so nothing silently believes a text was sent.
 */
export function createSmsChannel(): NotifyChannel {
  return {
    name: 'sms',
    async send() {
      return { ok: false, reason: 'sms channel is not configured yet' };
    },
  };
}
