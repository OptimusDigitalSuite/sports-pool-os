import type { NotifyChannel, SendResult } from '@/lib/notify/types';

/** The slice of the Resend SDK this channel uses, so tests need no network. */
export interface ResendLike {
  emails: {
    send(payload: { from: string; to: string; subject: string; text: string }): Promise<{
      data: { id: string } | null;
      error: { message: string } | null;
    }>;
  };
}

export function createResendChannel(config: { from: string; client: ResendLike }): NotifyChannel {
  return {
    name: 'email',
    async send(message): Promise<SendResult> {
      try {
        const response = await config.client.emails.send({
          from: config.from,
          to: message.to,
          subject: message.subject,
          text: message.body,
        });
        if (response.error) return { ok: false, reason: response.error.message };
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
