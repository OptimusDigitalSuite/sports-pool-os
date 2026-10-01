import { Resend } from 'resend';
import { createNoopChannel } from '@/lib/notify/noop';
import { createResendChannel } from '@/lib/notify/resend';
import type { NotifyChannel } from '@/lib/notify/types';

export interface ConfiguredChannel {
  channel: NotifyChannel;
  /**
   * False when the noop channel is standing in. This matters because noop
   * reports `{ ok: true }` — it is a stub for the tick, where a send that goes
   * nowhere is preferable to a crash. Any caller that reports delivery back to
   * a person must check this flag, or it will tell the commissioner twelve
   * invites went out when none did.
   */
  configured: boolean;
}

/** Resolves the outbound email channel from the environment, once, in one place. */
export function createConfiguredChannel(): ConfiguredChannel {
  const from = process.env.RESEND_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  if (!from || !apiKey) return { channel: createNoopChannel(), configured: false };
  return { channel: createResendChannel({ from, client: new Resend(apiKey) }), configured: true };
}
