'use server';

import { revalidatePath } from 'next/cache';
import { createRepositories, type Repositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { buildInvite, generateMagicToken } from '@/lib/ui/invite';
import { looksLikeEmail, parseRoster, type RosterError } from '@/lib/invite/parseRoster';
import { createConfiguredChannel } from '@/lib/notify/configured';
import type { PlayerRow } from '@/lib/db/types';

/**
 * A server action is its own POST endpoint: the page's notFound() gate
 * protects rendering, not this. Every action here re-resolves the caller
 * from the token and re-checks commissioner status itself, rather than
 * trusting anything the page (or a forged request) hands it — the same
 * magic_token/is_commissioner credential the console's page check uses.
 */
async function requireCommissioner(repos: Repositories, token: string): Promise<PlayerRow | null> {
  const viewer = await repos.players.getByToken(token);
  if (!viewer || !viewer.is_active || !viewer.is_commissioner) return null;
  return viewer;
}

/**
 * Adding someone is the whole onboarding: a name, a contact, and a link you
 * paste into the group chat. No signup form, no password, no app store.
 */
export async function addPlayer(
  token: string,
  name: string,
  email: string | null,
): Promise<{ ok: true; invite: string } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  if (!name.trim()) return { ok: false, reason: 'name is required' };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  // Fail before creating anything: a player row with an unpasteable
  // "/p/<token>" invite (no host) is worse than not adding them at all.
  if (!baseUrl) return { ok: false, reason: 'NEXT_PUBLIC_BASE_URL is not configured' };

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const playerToken = generateMagicToken();
  // Through the repository rather than a raw insert, so the duplicate case is
  // handled in the one place that knows what 23505 means. Since migration
  // 0004 a pool cannot hold the same address twice, and a raw insert would
  // surface that as a Postgres constraint string.
  const created = await repos.players.create({
    pool_id: viewer.pool_id,
    name: name.trim(),
    email,
    phone: null,
    magic_token: playerToken,
    is_commissioner: false,
    is_active: true,
  });
  if (!created) {
    return { ok: false, reason: 'someone in this pool already has that email address' };
  }

  revalidatePath(`/p/${token}/admin`);
  return {
    ok: true,
    invite: buildInvite({
      baseUrl,
      token: created.magic_token,
      playerName: name.trim(),
      poolName: pool.name,
      buyInCents: pool.buy_in_cents,
    }),
  };
}

/**
 * "Their $10 arrived" — a tap-to-confirm ledger event, never a celebration
 * (DESIGN.md §8 bans confetti/glow on a paid chip; this is the action behind
 * that chip flipping from outline to solid).
 *
 * confirmed_by used to be nullable in practice because there was no auth: no
 * player was reliably flagged as *the* commissioner, so the caller was
 * unknown and null was the honest value. Now the console is gated on
 * is_commissioner, so whoever reaches this line IS the confirming
 * commissioner — confirmed_by is always viewer.id from here on. (The column
 * stays nullable in the schema for entries confirmed before this gate
 * existed.)
 */
export async function markPaid(
  token: string,
  entryId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const entry = await repos.entries.getById(entryId);
  if (!entry) return { ok: false, reason: 'entry not found' };

  const week = await repos.weeks.getById(entry.week_id);
  // entryId arrives as untrusted input on a path that writes the money
  // ledger — a forged id could name a real entry belonging to a different
  // pool. Verify it resolves back to the calling commissioner's own pool
  // before writing anything, the same class of check as freezeWeek's
  // WeekPoolMismatchError. The failure reads identically to "not found"
  // rather than confirming a foreign entry exists.
  if (!week || week.pool_id !== viewer.pool_id) return { ok: false, reason: 'entry not found' };

  await repos.entries.markPaid(entryId, 'cashapp', viewer.id);
  revalidatePath(`/p/${token}/admin`);
  return { ok: true };
}

/**
 * "He paid" for a player who has not picked yet.
 *
 * An entry is normally created by picking, which leaves paying-without-
 * picking with nothing to record: the player is in the pot and the console
 * has no row for them. Worse, auto-pick refuses to enter anybody who did not
 * join, so at lock they would get no picks at all despite having paid.
 * Creating the entry here puts them in the week properly — auto-pick then
 * fills their card like everyone else's.
 */
export async function markPlayerPaid(
  token: string,
  playerId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const target = await repos.players.getById(playerId);
  if (!target || target.pool_id !== viewer.pool_id) {
    return { ok: false, reason: 'that player is not in this pool' };
  }

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) return { ok: false, reason: 'no week is open yet' };

  let entry = (await repos.entries.listByWeek(week.id)).find((row) => row.player_id === playerId);

  if (!entry) {
    // Money arriving late against an existing entry is a ledger correction
    // and always allowed. Creating a *new* entry after the week is graded
    // would change a pot that has already been paid out.
    if (week.status === 'frozen') {
      return { ok: false, reason: 'that week is frozen and cannot take a new entry' };
    }
    await repos.entries.ensure(playerId, week.id, pool.buy_in_cents);
    entry = (await repos.entries.listByWeek(week.id)).find((row) => row.player_id === playerId);
    if (!entry) return { ok: false, reason: 'could not enter that player' };
  }

  await repos.entries.markPaid(entry.id, 'cashapp', viewer.id);
  revalidatePath(`/p/${token}/admin`);
  return { ok: true };
}

export async function toggleAutopick(
  token: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const { error } = await client
    .from('pools')
    .update({ settings: { ...pool.settings, autopick_enabled: enabled } })
    .eq('id', viewer.pool_id);
  if (error) return { ok: false, reason: error.message };

  revalidatePath(`/p/${token}/admin`);
  return { ok: true };
}

/**
 * Overrides the week's automatic first-kickoff deadline.
 *
 * `null` hands the week back to the clock. A frozen week refuses both
 * directions — it has been scored and paid, and reopening it would put picks
 * back in play against a settled result (enforced in the repository, not
 * here, so every caller inherits it).
 */
/**
 * Whether a game counts toward the week.
 *
 * The deadline is the earliest kickoff among the games that count, so
 * excluding an outlier — a Wednesday opener, a Friday morning game abroad —
 * is what lets a pool enter a week whose schedule starts days before the
 * slate everyone actually plays. It also drops the game from scoring, which
 * is the only fair outcome when nobody could have picked it in time.
 */
/**
 * Gives an existing player an address.
 *
 * Players added by name alone are invisible to every notification agent —
 * nothing can nag someone it cannot write to — so this is what moves them
 * from "chase them by hand" to "the pool chases them". Lowercased on the way
 * in to match the partial unique index, which is on lower(email): without it
 * a capital typed by a phone keyboard would slip past the duplicate check and
 * make a second person out of one.
 */
export async function setPlayerEmail(
  token: string,
  playerId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const normalized = email.trim().toLowerCase();
  if (!looksLikeEmail(normalized)) {
    return { ok: false, reason: 'that does not look like an email address' };
  }

  // Commissioner of *this* pool only. Without the check, a valid commissioner
  // token would edit anybody in the table.
  const target = await repos.players.getById(playerId);
  if (!target || target.pool_id !== viewer.pool_id) {
    return { ok: false, reason: 'that player is not in this pool' };
  }

  const outcome = await repos.players.setEmail(playerId, normalized);
  if (outcome === 'duplicate') {
    return { ok: false, reason: 'somebody in this pool already uses that address' };
  }

  revalidatePath(`/p/${token}/admin`);
  return { ok: true };
}

/**
 * Takes a player out of the pool for good.
 *
 * Two things have to happen together. Deactivating alone would leave their
 * unpaid entry in the week, and `potCents` counts every entry paid or not —
 * so the pot would advertise money that is never coming, and the payout
 * engine would divide it. Dropping the entry alone would leave a live link
 * and a player the agents keep chasing.
 *
 * Soft delete, not a row deletion: their picks and past weeks stay intact, so
 * someone who comes back in November is a flag flip.
 *
 * `confirmation` is the typed word. A destructive control that a mis-tap can
 * fire is the problem, so the check lives here rather than only in the dialog
 * — the action is a POST endpoint of its own.
 */
export async function removePlayer(
  token: string,
  playerId: string,
  confirmation: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (confirmation.trim() !== 'REMOVE') return { ok: false, reason: 'type REMOVE to confirm' };

  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  // The console is gated on being an active commissioner, so removing
  // yourself is a locked door with the key inside.
  if (playerId === viewer.id) return { ok: false, reason: 'you cannot remove yourself' };

  const target = await repos.players.getById(playerId);
  if (!target || target.pool_id !== viewer.pool_id) {
    return { ok: false, reason: 'that player is not in this pool' };
  }

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  const entry = week
    ? (await repos.entries.listByWeek(week.id)).find((row) => row.player_id === playerId)
    : undefined;

  if (entry?.paid_at) {
    // Deleting a paid entry erases money that actually arrived; keeping it
    // holds a departed player in the pot. A person decides about the refund.
    return {
      ok: false,
      reason: 'they have paid for this week — settle that first, then remove them',
    };
  }

  if (entry) await repos.entries.remove(entry.id);
  await repos.players.setActive(playerId, false);

  revalidatePath(`/p/${token}/admin`);
  return { ok: true };
}

export async function setGameCounts(
  token: string,
  gameId: string,
  counts: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) return { ok: false, reason: 'no week yet' };
  // A frozen week has already been graded and paid. Changing which games
  // counted after that would rewrite a settled result.
  if (week.status === 'frozen') {
    return { ok: false, reason: 'that week is frozen and cannot be changed' };
  }

  const game = await repos.games.getById(gameId);
  if (!game || game.season !== week.season || game.week !== week.week_number) {
    return { ok: false, reason: 'that game is not part of this week' };
  }

  try {
    if (counts) await repos.weekExclusions.remove(week.id, gameId);
    else await repos.weekExclusions.add(week.id, gameId, 'commissioner');
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not change the game' };
  }

  revalidatePath(`/p/${token}/admin`);
  revalidatePath(`/p/${token}`);
  return { ok: true };
}

export async function setWeekLock(
  token: string,
  override: 'locked' | 'open' | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) return { ok: false, reason: 'no week to lock yet' };
  // Belt and braces with the repository guard: report the refusal rather
  // than silently updating zero rows.
  if (week.status === 'frozen') {
    return { ok: false, reason: 'that week is frozen and cannot be reopened' };
  }

  try {
    await repos.weeks.setLockOverride(week.id, override);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'could not change the lock' };
  }

  revalidatePath(`/p/${token}/admin`);
  revalidatePath(`/p/${token}`);
  return { ok: true };
}

/** Runs the agent tick immediately instead of waiting for the next cron fire. */
export async function forceTick(token: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = createServiceClient();
  const repos = createRepositories(client);
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  // Without this, fetch("undefined/api/agents/tick") throws inside a server
  // action and crashes the console instead of failing legibly.
  if (!baseUrl) return { ok: false, reason: 'NEXT_PUBLIC_BASE_URL is not configured' };

  const response = await fetch(`${baseUrl}/api/agents/tick`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.TICK_SECRET}` },
  });
  revalidatePath(`/p/${token}/admin`);
  if (!response.ok) return { ok: false, reason: `tick endpoint returned ${response.status}` };
  return { ok: true };
}

export type RosterStatus = 'invited' | 'link_only' | 'duplicate' | 'email_failed';

export interface RosterOutcome {
  name: string;
  email: string | null;
  status: RosterStatus;
  /** The message to paste, present whenever the commissioner must deliver it. */
  invite?: string;
  reason?: string;
}

/**
 * The whole roster in one paste, because twelve friends should not be twelve
 * trips through the add form.
 *
 * Safe to run twice on the same text: the unique index on
 * (pool_id, lower(email)) turns the second attempt into `duplicate`, and the
 * notification claim stops a second email even if the page was submitted
 * twice.
 *
 * Nothing per-line throws. A bad address does not lose a player — the row and
 * token already exist, so the invite comes back in the outcome for the
 * commissioner to pass on by hand.
 */
export async function addRoster(
  token: string,
  text: string,
): Promise<
  | { ok: true; outcomes: RosterOutcome[]; errors: RosterError[] }
  | { ok: false; reason: string }
> {
  const repos = createRepositories(createServiceClient());
  const viewer = await requireCommissioner(repos, token);
  if (!viewer) return { ok: false, reason: 'not authorized' };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return { ok: false, reason: 'NEXT_PUBLIC_BASE_URL is not configured' };

  const { players, errors } = parseRoster(text);
  if (players.length === 0) return { ok: true, outcomes: [], errors };

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) return { ok: false, reason: 'pool not found' };

  // Resolved once, before the loop: whether mail works is a property of the
  // deployment, not of any one player.
  const { channel, configured } = createConfiguredChannel();

  const outcomes: RosterOutcome[] = [];

  for (const line of players) {
    const created = await repos.players.create({
      pool_id: viewer.pool_id,
      name: line.name,
      email: line.email,
      phone: null,
      magic_token: generateMagicToken(),
      is_commissioner: false,
      is_active: true,
    });

    if (!created) {
      outcomes.push({ name: line.name, email: line.email, status: 'duplicate' });
      continue;
    }

    const invite = buildInvite({
      baseUrl,
      token: created.magic_token,
      playerName: created.name,
      poolName: pool.name,
      buyInCents: pool.buy_in_cents,
    });

    // Two different reasons the commissioner has to deliver this by hand, and
    // both must hand back the text. The unconfigured case is the dangerous
    // one: the noop channel answers `{ ok: true }`, so sending anyway would
    // report an invite that never left the building.
    if (!line.email) {
      outcomes.push({ ...base(line), status: 'link_only', invite, reason: 'no email address on file' });
      continue;
    }
    if (!configured) {
      outcomes.push({
        ...base(line),
        status: 'link_only',
        invite,
        reason: 'email delivery is not configured',
      });
      continue;
    }

    const claimed = await repos.notifications.claim(created.id, channel.name, 'invite', `invite:${created.id}`);
    if (!claimed) {
      outcomes.push({ ...base(line), status: 'invited' });
      continue;
    }

    const sent = await channel.send({
      to: line.email,
      subject: `You're in ${pool.name}`,
      body: invite,
    });

    if (sent.ok) {
      outcomes.push({ ...base(line), status: 'invited' });
    } else {
      // The player exists and the claim is spent; hand back the text rather
      // than stranding someone who is already in the pool.
      await repos.notifications.release(`invite:${created.id}`);
      outcomes.push({ ...base(line), status: 'email_failed', invite, reason: sent.reason });
    }
  }

  revalidatePath(`/p/${token}/admin`);
  return { ok: true, outcomes, errors };
}

/** Keeps the name/email pair identical across every outcome branch. */
function base(line: { name: string; email: string | null }) {
  return { name: line.name, email: line.email };
}
