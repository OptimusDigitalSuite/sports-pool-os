export interface OutboundMessage {
  to: string;
  subject: string;
  body: string;
}

export type SendResult = { ok: true } | { ok: false; reason: string };

export interface NotifyChannel {
  readonly name: 'email' | 'sms' | 'noop';
  /** Never throws. A failed send is a value, not an exception — nothing about
   *  scoring or freezing may be blocked by a mail provider. */
  send(message: OutboundMessage): Promise<SendResult>;
}
