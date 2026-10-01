import type { Action, Agent, NotificationTemplate, TickState } from '@/lib/agents/types';
import type { PlayerRow } from '@/lib/db/types';
import { cashAppLink } from '@/lib/ledger/payouts';

/**
 * Send windows, measured backwards from the week's first kickoff.
 *
 * The cadence used to be a weekday-and-hour schedule: announce Thursday, nag
 * Saturday and Sunday, all at 14:00 UTC. That assumes every week locks on
 * Sunday, and no week does. Games lock individually at their own kickoff, and
 * a normal week opens Thursday night — so the Saturday nag arrived after the
 * Thursday game had already locked. Thanksgiving, the late-December Saturday
 * slates and the London morning games were wrong by more.
 *
 * Anchoring to the first kickoff makes one rule correct for every week shape.
 *
 * The windows are also open-ended rather than a single matching hour. Under
 * `hour === 14` a single missed cron fire lost that message for the week; now
 * a late tick still sends, and the dedupe key still guarantees exactly one
 * copy. Two nags are preserved — losing the last reminder before the lock was
 * a real defect once before — as two bands with distinct dedupe suffixes.
 */
const ANNOUNCE_LEAD_MS = 72 * 60 * 60 * 1000;
const EARLY_NAG_LEAD_MS = 24 * 60 * 60 * 1000;
const FINAL_NAG_LEAD_MS = 3 * 60 * 60 * 1000;

/** Kickoff times that cannot be read are ignored rather than guessed at. */
function firstKickoffMs(games: { kickoff_at: string }[]): number | null {
  const times = games.map((g) => Date.parse(g.kickoff_at)).filter((ms) => !Number.isNaN(ms));
  return times.length === 0 ? null : Math.min(...times);
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function notify(
  player: PlayerRow,
  weekId: string,
  template: NotificationTemplate,
  subject: string,
  body: string,
  keySuffix?: string,
): Action {
  return {
    type: 'notify',
    playerId: player.id,
    template,
    // picks_open and week_winner fire once per week, so template+week+player
    // is already unique. The Saturday and Sunday nags are the same template to
    // the same player in the same week, so without a day suffix Saturday's
    // claim would silently swallow Sunday's — losing the last reminder before
    // the lock, which is the one that matters most.
    dedupeKey: keySuffix
      ? `${template}:${weekId}:${player.id}:${keySuffix}`
      : `${template}:${weekId}:${player.id}`,
    subject,
    body,
  };
}

/**
 * The outbound voice of the pool: opens the week, chases unpicked games and
 * unpaid buy-ins, and announces the winner.
 *
 * Every message carries a dedupe key scoped to the week and player, so the
 * five-minute tick can re-decide freely — the executor claims the key before
 * sending and drops anything already sent.
 */
export const commissioner: Agent = {
  name: 'commissioner',
  decide(state: TickState): Action[] {
    // A synthetic bootstrap week (no id) has no schedule and no entries yet.
    // Announcing "picks are open" for it would promise a week that does not
    // exist.
    if (state.week.id === '') return [];

    const reachable = state.players.filter((p) => p.is_active && p.email);
    if (reachable.length === 0) return [];

    if (state.week.status === 'frozen') {
      if (state.results.length === 0) return [];
      const winners = state.results.filter((r) => r.rank === 1);
      const names = new Map(state.players.map((p) => [p.id, p.name]));
      const headline = winners
        .map((w) => `${names.get(w.player_id) ?? 'Someone'} (${money(w.payout_cents)})`)
        .join(' and ');
      return reachable.map((player) =>
        notify(
          player,
          state.week.id,
          'week_winner',
          `Week ${state.week.week_number} is in the books`,
          `Winner: ${headline}. Full standings are in the app.`,
        ),
      );
    }

    const firstKickoff = firstKickoffMs(state.games);
    if (firstKickoff === null) return [];

    const untilKickoff = firstKickoff - state.now.getTime();
    if (untilKickoff > ANNOUNCE_LEAD_MS) return [];

    const actions: Action[] = [];

    // Emitted in every window, not just the announce one, so a tick outage
    // during the announce window delays this rather than skipping it. The
    // once-per-week dedupe key stops a second copy.
    for (const player of reachable) {
      actions.push(
        notify(
          player,
          state.week.id,
          'picks_open',
          `Week ${state.week.week_number} picks are open`,
          `${state.games.length} games this week. Tap your link and pick them.`,
        ),
      );
    }

    if (untilKickoff > EARLY_NAG_LEAD_MS) return actions;

    // Two reminders, distinguished by suffix so the second is not swallowed by
    // the first one's claim.
    const nagKey = untilKickoff > FINAL_NAG_LEAD_MS ? 'early' : 'final';

    const entryByPlayer = new Map(state.entries.map((entry) => [entry.player_id, entry]));
    const pickCount = new Map<string, number>();
    for (const pick of state.picks) {
      pickCount.set(pick.player_id, (pickCount.get(pick.player_id) ?? 0) + 1);
    }

    for (const player of reachable) {
      if (!entryByPlayer.has(player.id)) continue;

      const made = pickCount.get(player.id) ?? 0;
      if (made < state.games.length) {
        actions.push(
          notify(
            player,
            state.week.id,
            'unpicked_nag',
            `${state.games.length - made} games still unpicked`,
            `You have ${state.games.length - made} of ${state.games.length} games left. They lock at kickoff.`,
            nagKey,
          ),
        );
      }

      const entry = entryByPlayer.get(player.id);
      if (entry && entry.paid_at === null) {
        const link = state.pool.settings.cashtag
          ? ` ${cashAppLink(state.pool.settings.cashtag, entry.buy_in_cents)}`
          : '';
        actions.push(
          notify(
            player,
            state.week.id,
            'unpaid_nag',
            `Week ${state.week.week_number} buy-in`,
            `You owe ${money(entry.buy_in_cents)} for this week.${link}`,
            nagKey,
          ),
        );
      }
    }
    return actions;
  },
};
