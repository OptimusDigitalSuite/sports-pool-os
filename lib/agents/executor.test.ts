import { describe, it, expect, vi } from 'vitest';
import { executeActions } from '@/lib/agents/executor';
import { createNoopChannel } from '@/lib/notify/noop';
import type { Action, TickState } from '@/lib/agents/types';
import type { NotifyChannel, OutboundMessage, SendResult } from '@/lib/notify/types';
import type { PlayerRow, PoolRow, WeekRow } from '@/lib/db/types';

const pool: PoolRow = {
  id: 'pool1', name: 'Sunday Money', season: 2026, buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn', timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};
const week: WeekRow = {
  id: 'w1', pool_id: 'pool1', season: 2026, week_number: 3,
  tiebreak_game_id: 'g1', status: 'live', frozen_at: null, created_at: '',
  lock_override: null,
};
const player: PlayerRow = {
  id: 'p1', pool_id: 'pool1', name: 'Bill', email: 'bill@x.test', phone: null,
  magic_token: 'tok', is_commissioner: false, is_active: true, created_at: '',
};

const state: TickState = {
  pool, week, games: [], players: [player], picks: [], guesses: [], entries: [], results: [],
  now: new Date('2026-09-20T16:00:00.000Z'),
};

/**
 * A configured channel (name !== 'noop') that records what it sent, used as
 * the default in `deps()` so most tests exercise the "mail is configured"
 * path. The noop channel is reserved for the tests that specifically assert
 * on the unconfigured-channel behavior.
 */
function fakeChannel(name: NotifyChannel['name'] = 'email') {
  const sent: OutboundMessage[] = [];
  return {
    name,
    sent,
    async send(message: OutboundMessage): Promise<SendResult> {
      sent.push(message);
      return { ok: true };
    },
  };
}

function deps(over: Partial<Parameters<typeof executeActions>[0]> = {}) {
  const channel = fakeChannel();
  return {
    repos: { notifications: { claim: vi.fn().mockResolvedValue(true), release: vi.fn().mockResolvedValue(undefined) } },
    channel,
    submitPick: vi.fn().mockResolvedValue(undefined),
    freezeWeek: vi.fn().mockResolvedValue(undefined),
    generateRecap: vi.fn().mockResolvedValue('what a week'),
    ...over,
  } as unknown as Parameters<typeof executeActions>[0] & { channel: typeof channel };
}

const notifyAction: Action = {
  type: 'notify', playerId: 'p1', template: 'picks_open',
  dedupeKey: 'picks_open:w1:p1', subject: 'Picks are open', body: 'go pick',
};

describe('executeActions link in every message', () => {
  it("ends the message with the recipient's own link, so a nag is actionable", async () => {
    const d = deps({ appUrl: 'https://pool.test' } as never);
    await executeActions(d, state, [notifyAction]);

    const sent = d.channel.sent[0]!;
    const player = state.players.find((p) => p.id === notifyAction.playerId)!;
    expect(sent.body).toContain(notifyAction.body);
    expect(sent.body.trimEnd().endsWith(`https://pool.test/p/${player.magic_token}`)).toBe(true);
  });

  it('sends the body unchanged when no base URL is configured', async () => {
    // Better a reminder with no link than one pointing at "undefined/p/...".
    const d = deps({ appUrl: '' } as never);
    await executeActions(d, state, [notifyAction]);
    expect(d.channel.sent[0]!.body).toBe(notifyAction.body);
  });
});

describe('executeActions', () => {
  it('with a noop channel, skips notify without claiming or sending, and reports it is unconfigured', async () => {
    // An unconfigured mail channel must not consume dedupe keys — otherwise
    // configuring email later silently skips every message already "sent".
    const d = deps({ channel: createNoopChannel() } as never);
    const report = await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.claim).not.toHaveBeenCalled();
    expect(d.channel.sent).toHaveLength(0);
    expect(report.skipped).toBe(1);
    expect(report.errors.join(' ')).toContain('mail channel is not configured');
  });

  it('with a noop channel, skips generate_recap without claiming, generating, or sending', async () => {
    const d = deps({ channel: createNoopChannel() } as never);
    const recapAction: Action = { type: 'generate_recap', weekId: 'w1' };
    const report = await executeActions(d, state, [recapAction]);
    expect(d.repos.notifications.claim).not.toHaveBeenCalled();
    expect(d.generateRecap).not.toHaveBeenCalled();
    expect(d.channel.sent).toHaveLength(0);
    expect(report.skipped).toBe(1);
    expect(report.errors.join(' ')).toContain('mail channel is not configured');
  });

  it('claims the dedupe key before sending', async () => {
    const d = deps();
    await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.claim).toHaveBeenCalledWith('p1', 'email', 'picks_open', 'picks_open:w1:p1');
    expect(d.channel.sent).toHaveLength(1);
  });

  it('does not send when the claim is lost', async () => {
    const d = deps({ repos: { notifications: { claim: vi.fn().mockResolvedValue(false) } } } as never);
    await executeActions(d, state, [notifyAction]);
    expect(d.channel.sent).toHaveLength(0);
  });

  it('refuses to freeze a synthetic, unsaved week (empty weekId)', async () => {
    const d = deps();
    const report = await executeActions(d, state, [{ type: 'freeze_week', weekId: '' }]);
    expect(d.freezeWeek).not.toHaveBeenCalled();
    expect(report.skipped).toBe(1);
  });

  it('keeps going when one action fails', async () => {
    const d = deps({ freezeWeek: vi.fn().mockRejectedValue(new Error('boom')) } as never);
    const report = await executeActions(d, state, [{ type: 'freeze_week', weekId: 'w1' }, notifyAction]);
    expect(report.failed).toBe(1);
    expect(report.performed).toBe(1);
    expect(d.channel.sent).toHaveLength(1);
  });

  it('releases the claim when a send fails for a transient reason, so the next tick can retry', async () => {
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'domain not verified' });
    await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.release).toHaveBeenCalledWith('picks_open:w1:p1');
  });

  it('treats an unverified sending domain as transient (the operator will fix it) and releases the claim', async () => {
    // A bad sender configuration gets fixed, unlike a bad recipient address —
    // classifying it permanent would abandon every message sent during the
    // misconfiguration window forever, right as the operator fixes it and
    // expects delivery to resume.
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'domain not verified' });
    const report = await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.release).toHaveBeenCalledWith('picks_open:w1:p1');
    expect(report.errors.join(' ')).not.toContain('abandoned');
  });

  it('treats a bounced recipient as permanent and keeps the claim rather than retrying forever', async () => {
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'message bounced' });
    const report = await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.release).not.toHaveBeenCalled();
    expect(report.errors.join(' ')).toContain('abandoned');
  });

  it('keeps the claim, and reports the message as abandoned, when a notify send fails for a permanent-looking reason', async () => {
    // A permanently bad address never gets fixed by retrying — releasing the
    // claim would produce a send attempt every five minutes forever.
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'invalid recipient address' });
    const report = await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.release).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
    expect(report.errors.join(' ')).toContain('abandoned');
    expect(report.errors.join(' ')).toContain('invalid recipient address');
  });

  it('keeps the claim when the send succeeds', async () => {
    const d = deps();
    await executeActions(d, state, [notifyAction]);
    expect(d.repos.notifications.release).not.toHaveBeenCalled();
  });

  it('does not consume a key for a player with no email address', async () => {
    const d = deps();
    const noEmail = { ...state, players: [{ ...state.players[0]!, email: null }] };
    const report = await executeActions(d, noEmail, [notifyAction]);
    expect(d.repos.notifications.claim).not.toHaveBeenCalled();
    expect(report.skipped).toBe(1);
  });

  it('routes an auto-pick through submitPick with the auto flags set', async () => {
    const d = deps();
    await executeActions(d, state, [
      { type: 'auto_pick', playerId: 'p1', weekId: 'w1', gameId: 'g1', pickedAbbr: 'MIN' },
    ]);
    expect(d.submitPick).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isAuto: true, allowLocked: true, pickedAbbr: 'MIN' }),
    );
  });

  it('swallows a rejected auto-pick rather than failing the tick', async () => {
    const d = deps({ submitPick: vi.fn().mockRejectedValue(new Error('did not join this week')) } as never);
    const report = await executeActions(d, state, [
      { type: 'auto_pick', playerId: 'p1', weekId: 'w1', gameId: 'g1', pickedAbbr: 'MIN' },
    ]);
    expect(report.failed).toBe(1);
  });

  const recapAction: Action = { type: 'generate_recap', weekId: 'w1' };

  it('claims before generating, so a lost claim costs no model call', async () => {
    const d = deps({ repos: { notifications: { claim: vi.fn().mockResolvedValue(false) } } } as never);
    const report = await executeActions(d, state, [recapAction]);
    expect(d.generateRecap).not.toHaveBeenCalled();
    expect(d.channel.sent).toHaveLength(0);
    expect(report.skipped).toBe(1);
  });

  it('generates and sends once the claim is won', async () => {
    const d = deps();
    const report = await executeActions(d, state, [recapAction]);
    expect(d.generateRecap).toHaveBeenCalledTimes(1);
    expect(d.channel.sent).toHaveLength(1);
    expect(report.performed).toBe(1);
  });

  it('counts a failed recap send instead of reporting success', async () => {
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'domain not verified' });
    const report = await executeActions(d, state, [recapAction]);
    expect(report.failed).toBe(1);
    expect(report.performed).toBe(0);
    expect(report.errors.join(' ')).toContain('domain not verified');
  });

  it('skips recipients with no email address', async () => {
    const d = deps();
    const noEmail = { ...state, players: [{ ...state.players[0]!, email: null }] };
    const report = await executeActions(d, noEmail, [recapAction]);
    expect(d.channel.sent).toHaveLength(0);
    expect(report.performed).toBe(1);
  });

  it('a total send failure releases the per-player delivery key, but never the generation key', async () => {
    // recap.decide re-emits generate_recap on every tick the week stays
    // frozen. Releasing the generation claim on failure would re-run the
    // (paid) model call every five minutes forever. Only the per-recipient
    // delivery claim may be released, so that recipient retries next tick
    // without anyone else being double-sent and without regenerating text.
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'domain not verified' });
    await executeActions(d, state, [recapAction]);
    expect(d.repos.notifications.release).toHaveBeenCalledWith('week_recap_send:w1:p1');
    expect(d.repos.notifications.release).not.toHaveBeenCalledWith('week_recap:w1');
  });

  it('keeps the per-player delivery claim, and reports the recap as abandoned, for a permanent-looking send failure', async () => {
    const d = deps();
    d.channel.send = async () => ({ ok: false as const, reason: 'invalid recipient address' });
    const report = await executeActions(d, state, [recapAction]);
    expect(d.repos.notifications.release).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
    expect(report.errors.join(' ')).toContain('abandoned');
    expect(report.errors.join(' ')).toContain('invalid recipient address');
  });

  it('surfaces a recap degradation reason in report.errors without failing the send', async () => {
    const d = deps({
      generateRecap: vi.fn(async (_input, onDegraded?: (reason: string) => void) => {
        onDegraded?.('rate limited');
        return 'plain summary text';
      }),
    } as never);
    const report = await executeActions(d, state, [recapAction]);
    expect(report.performed).toBe(1);
    expect(report.errors.join(' ')).toContain('rate limited');
  });

  it('releases only the failed recipient delivery key when some recipients failed, to avoid double-sending', async () => {
    const d = deps();
    const secondPlayer: PlayerRow = { ...player, id: 'p2', email: 'kenneth@x.test' };
    const twoPlayers = { ...state, players: [player, secondPlayer] };
    let call = 0;
    d.channel.send = async () => {
      call += 1;
      return call === 1 ? { ok: true as const } : { ok: false as const, reason: 'domain not verified' };
    };
    await executeActions(d, twoPlayers, [recapAction]);
    expect(d.repos.notifications.release).toHaveBeenCalledTimes(1);
    expect(d.repos.notifications.release).toHaveBeenCalledWith('week_recap_send:w1:p2');
  });

  it('claims a per-player delivery key before sending the recap, distinct from the generation key', async () => {
    const d = deps();
    await executeActions(d, state, [recapAction]);
    expect(d.repos.notifications.claim).toHaveBeenCalledWith(null, 'email', 'week_recap', 'week_recap:w1');
    expect(d.repos.notifications.claim).toHaveBeenCalledWith(
      'p1',
      'email',
      'week_recap',
      'week_recap_send:w1:p1',
    );
  });

  it('a second tick with the generation key already claimed skips entirely without calling generateRecap', async () => {
    const d = deps({
      repos: {
        notifications: {
          // Only the generation key is already claimed (by an earlier tick);
          // any per-player delivery key would still be free.
          claim: vi.fn((_playerId, _channel, _template, dedupeKey: string) =>
            Promise.resolve(dedupeKey !== 'week_recap:w1'),
          ),
          release: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as never);
    const report = await executeActions(d, state, [recapAction]);
    expect(d.generateRecap).not.toHaveBeenCalled();
    expect(d.channel.sent).toHaveLength(0);
    expect(report.skipped).toBe(1);
  });
});
