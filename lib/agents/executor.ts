import type { Action, TickState } from '@/lib/agents/types';
import type { Repositories } from '@/lib/db/repositories';
import type { NflDataProvider } from '@/lib/nfl/types';
import type { NotifyChannel } from '@/lib/notify/types';
import type { RecapInput } from '@/lib/recap/summary';
import type { SubmitPickInput } from '@/lib/services/submitPick';

export interface ExecutorDeps {
  repos: Repositories;
  channel: NotifyChannel;
  submitPick(deps: { repos: Repositories; now: () => Date }, input: SubmitPickInput): Promise<void>;
  freezeWeek(deps: { repos: Repositories }, poolId: string, weekId: string): Promise<void>;
  generateRecap(input: RecapInput, onDegraded?: (reason: string) => void): Promise<string>;
  syncWeek(
    deps: { repos: Repositories; provider: NflDataProvider },
    poolId: string,
    season: number,
    weekNumber: number,
  ): Promise<unknown>;
  provider: NflDataProvider;
  /**
   * Origin for player links. Empty when unconfigured, in which case messages
   * go out without one — better a reminder with no link than one pointing at
   * "undefined/p/...".
   */
  appUrl?: string;
}

export interface ExecutionReport {
  performed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

/**
 * Reasons that will never succeed on retry, so releasing the claim would make
 * the tick attempt the same doomed send every five minutes forever.
 *
 * Only recipient-side problems belong here. Sender-side configuration — an
 * unverified domain, a missing key, a bad from-address — is transient by
 * definition: someone fixes it, and the pending sends should then go out.
 */
function isPermanentFailure(reason: string): boolean {
  return /invalid recipient|invalid.*address|unsubscrib|suppress|bounce|mailbox.*(not found|unavailable)|no such user/i.test(
    reason,
  );
}

/**
 * Performs what the agents decided.
 *
 * One failing action never stops the rest — a mail provider outage must not
 * prevent a week from freezing, and a rejected auto-pick (the player never
 * joined) is an expected outcome rather than a fault. Every failure is
 * counted and reported so the commissioner console can show it.
 */
export async function executeActions(
  deps: ExecutorDeps,
  state: TickState,
  actions: Action[],
): Promise<ExecutionReport> {
  const report: ExecutionReport = { performed: 0, skipped: 0, failed: 0, errors: [] };

  // An unconfigured mail channel must not consume dedupe keys — otherwise
  // configuring email later silently skips every message already "sent".
  const canSend = deps.channel.name !== 'noop';

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'sync_week':
          await deps.syncWeek(
            { repos: deps.repos, provider: deps.provider },
            state.pool.id,
            action.season,
            action.weekNumber,
          );
          report.performed += 1;
          break;

        case 'freeze_week':
          // A synthetic, unsaved week (loadTickState hands one back for a
          // pool with no weeks row yet) has an empty id. The scorekeeper can
          // never emit freeze_week for it — it has no games, so it emits
          // sync_week instead — but refuse here too rather than relying on
          // that being true forever.
          if (action.weekId === '') {
            report.skipped += 1;
            break;
          }
          await deps.freezeWeek({ repos: deps.repos }, state.pool.id, action.weekId);
          report.performed += 1;
          break;

        case 'auto_pick':
          await deps.submitPick(
            { repos: deps.repos, now: () => state.now },
            {
              poolId: state.pool.id,
              playerId: action.playerId,
              weekId: action.weekId,
              gameId: action.gameId,
              pickedAbbr: action.pickedAbbr,
              isAuto: true,
              allowLocked: true,
            },
          );
          report.performed += 1;
          break;

        case 'notify': {
          if (!canSend) {
            report.skipped += 1;
            break;
          }

          // Check for an email address before claiming: a player with no
          // address can never be sent to, so claiming first would burn their
          // dedupe key on an outcome that was never in doubt.
          const player = state.players.find((p) => p.id === action.playerId);
          if (!player?.email) {
            report.skipped += 1;
            break;
          }

          const claimed = await deps.repos.notifications.claim(
            action.playerId,
            deps.channel.name,
            action.template,
            action.dedupeKey,
          );
          if (!claimed) {
            report.skipped += 1;
            break;
          }
          // Every message ends with the recipient's own link. A reminder
          // that says "you have 14 games left" and gives no way to pick them
          // is half a message — and the players who most need reminding are
          // exactly the ones who never had the link to begin with. Appended
          // here rather than in each agent so no template can forget it.
          const link = deps.appUrl ? `${deps.appUrl.replace(/\/+$/, '')}/p/${player.magic_token}` : null;

          const sent = await deps.channel.send({
            to: player.email,
            subject: action.subject,
            body: link ? `${action.body}

${link}` : action.body,
          });
          if (sent.ok) report.performed += 1;
          else {
            report.failed += 1;
            if (isPermanentFailure(sent.reason)) {
              // A permanently bad address never succeeds on retry — releasing
              // the claim would produce a send attempt every five minutes
              // forever. Keep it and record that the message was abandoned.
              report.errors.push(`notify ${action.dedupeKey}: message abandoned (${sent.reason})`);
            } else {
              // Release the claim so the next tick retries. Holding it would
              // make a single transient provider hiccup silently consume
              // every message for the rest of the season.
              await deps.repos.notifications.release(action.dedupeKey);
              report.errors.push(`notify ${action.dedupeKey}: ${sent.reason}`);
            }
          }
          break;
        }

        case 'generate_recap': {
          if (!canSend) {
            report.skipped += 1;
            break;
          }

          // Generation claim: permanent, never released. `recap.decide`
          // re-emits this on every tick while the week stays frozen, so
          // releasing it on a send failure would re-claim it next tick and
          // call the paid model again — every five minutes, forever. The
          // delivery loop below has its own per-recipient claims, so a
          // recipient whose send fails still gets retried without anyone
          // paying for another model call.
          const generationKey = `week_recap:${action.weekId}`;
          const claimed = await deps.repos.notifications.claim(
            null,
            deps.channel.name,
            'week_recap',
            generationKey,
          );
          if (!claimed) {
            report.skipped += 1;
            break;
          }

          const text = await deps.generateRecap(toRecapInput(state), (reason) => {
            // The recap degrading to the plain summary is expected on a rate
            // limit; it is NOT expected on a TypeError from an SDK shape
            // change. Both look identical to the pool, so without this the
            // pool would silently get the plain summary forever with no
            // signal that anything needs fixing.
            report.errors.push(`recap ${action.weekId} degraded: ${reason}`);
          });

          // Delivery: one claim per recipient, released on failure like any
          // other notification, so that person retries next tick without
          // regenerating the text or double-sending to anyone who already
          // received it.
          let failedRecipients = 0;
          for (const player of state.players) {
            if (!player.email) continue;
            const deliveryKey = `week_recap_send:${action.weekId}:${player.id}`;
            const claimedSend = await deps.repos.notifications.claim(
              player.id,
              deps.channel.name,
              'week_recap',
              deliveryKey,
            );
            if (!claimedSend) continue;

            const sent = await deps.channel.send({
              to: player.email,
              subject: `Week ${state.week.week_number} recap`,
              body: text,
            });
            if (!sent.ok) {
              failedRecipients += 1;
              if (isPermanentFailure(sent.reason)) {
                report.errors.push(
                  `recap ${action.weekId} -> ${player.id}: message abandoned (${sent.reason})`,
                );
              } else {
                await deps.repos.notifications.release(deliveryKey);
                report.errors.push(`recap ${action.weekId} -> ${player.id}: ${sent.reason}`);
              }
            }
          }

          if (failedRecipients > 0) report.failed += 1;
          else report.performed += 1;
          break;
        }
      }
    } catch (error) {
      report.failed += 1;
      report.errors.push(`${action.type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!canSend && report.skipped > 0) {
    report.errors.push('mail channel is not configured; no messages were sent');
  }

  return report;
}

export function toRecapInput(state: TickState): RecapInput {
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  const autoCount = new Map<string, number>();
  for (const pick of state.picks) {
    if (pick.is_auto) autoCount.set(pick.player_id, (autoCount.get(pick.player_id) ?? 0) + 1);
  }
  return {
    weekNumber: state.week.week_number,
    potCents: state.entries.reduce((sum, e) => sum + e.buy_in_cents, 0),
    rows: state.results.map((r) => ({
      name: names.get(r.player_id) ?? 'Unknown',
      correct: r.correct,
      incorrect: r.incorrect,
      rank: r.rank,
      payoutCents: r.payout_cents,
      tiebreakDelta: r.tiebreak_delta,
      autoPicks: autoCount.get(r.player_id) ?? 0,
    })),
  };
}
