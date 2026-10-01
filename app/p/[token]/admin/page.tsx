import { notFound } from 'next/navigation';
import { AddPlayerForm } from '@/components/AddPlayerForm';
import { PaidStrip, type PaidLine } from '@/components/PaidStrip';
import { Roster, type RosterMember } from '@/components/Roster';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { cashAppLink } from '@/lib/ledger/payouts';
import { buildInvite } from '@/lib/ui/invite';
import { forceTick, markPaid, setGameCounts, setWeekLock } from '@/app/p/[token]/admin/actions';
import { isWeekLocked, weekLockAtMs } from '@/lib/services/weekLock';
import { withoutExcluded } from '@/lib/services/weekGames';
import { deadlineLabel, kickoffLabel } from '@/lib/ui/clock';

export const dynamic = 'force-dynamic';

/**
 * The commissioner's whole interface to the pool: add a friend and get a
 * link to paste, tap to confirm a $10 arrived, see who's still owed.
 *
 * One credential model for the whole product: this route is gated on the
 * same magic_token/is_commissioner pair every other player-facing route
 * checks — there is no second auth system, and the commissioner's own
 * invite link (see lib/ui/invite.ts) is how they reach it. An unknown,
 * deactivated, or non-commissioner token gets the same 404 an invalid
 * player link gets elsewhere in the app, so this route's existence isn't
 * disclosed either.
 */
export default async function AdminPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = createServiceClient();
  const repos = createRepositories(client);

  const viewer = await repos.players.getByToken(token);
  if (!viewer || !viewer.is_active || !viewer.is_commissioner) notFound();

  // Scoped to the viewer's own pool, not the first row in the table — the
  // console used to do `.from('pools').select('*').limit(1)`, which was
  // wrong the moment a second pool existed.
  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) notFound();

  const week = await repos.weeks.latestForPool(pool.id, pool.season);

  // The deadline the players are actually subject to, derived the same way
  // the picks page and submitPick derive it.
  // Both lists are needed here and nowhere else: the deadline follows the
  // games that count, while the console has to show every game to let the
  // commissioner change which ones do.
  const allGames = week ? await repos.games.listByWeek(week.season, week.week_number) : [];
  const excludedIds = week ? await repos.weekExclusions.listByWeek(week.id) : [];
  const weekGames = withoutExcluded(allGames, excludedIds);
  const lockAtMs = weekLockAtMs(weekGames.map((game) => game.kickoff_at));
  const locked = week
    ? isWeekLocked({
        status: week.status,
        lockOverride: week.lock_override,
        kickoffs: weekGames.map((game) => game.kickoff_at),
        now: new Date(),
      })
    : false;

  const players = await repos.players.listActive(pool.id);
  const entries = week ? await repos.entries.listByWeek(week.id) : [];
  const names = new Map(players.map((p) => [p.id, p.name]));

  const lines: PaidLine[] = entries.map((entry) => ({
    playerId: entry.player_id,
    name: names.get(entry.player_id) ?? 'Unknown',
    paid: entry.paid_at !== null,
    owedCents: entry.buy_in_cents,
    payLink:
      entry.paid_at === null && pool.settings.cashtag
        ? cashAppLink(pool.settings.cashtag, entry.buy_in_cents)
        : null,
  }));

  // Pick counts come from the games that count, so a player is not credited
  // for a pick on a game the week dropped.
  const weekPicks = week ? await repos.picks.listByWeek(week.id) : [];
  const countedGameIds = new Set(weekGames.map((game) => game.id));
  const picksByPlayer = new Map<string, number>();
  for (const pick of weekPicks) {
    if (!countedGameIds.has(pick.game_id)) continue;
    picksByPlayer.set(pick.player_id, (picksByPlayer.get(pick.player_id) ?? 0) + 1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const roster: RosterMember[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    email: player.email,
    picks: picksByPlayer.get(player.id) ?? 0,
    paid: (() => {
      const entry = entries.find((row) => row.player_id === player.id);
      return entry ? entry.paid_at !== null : null;
    })(),
    invite: buildInvite({
      baseUrl,
      token: player.magic_token,
      playerName: player.name,
      poolName: pool.name,
      buyInCents: pool.buy_in_cents,
    }),
  }));

  const unpaid = entries.filter((entry) => entry.paid_at === null);

  return (
    <main className="min-h-[100dvh] space-y-6 px-4 py-8">
      <VideoBackdrop intensity="full" />
      <div className="mx-auto flex w-full max-w-[560px] items-baseline justify-between">
        <h1 className="font-[family-name:var(--font-barlow-condensed)] text-3xl">{pool.name}</h1>
        {week && (
          <span className="font-[family-name:var(--font-barlow-condensed)] text-[var(--text-tertiary)]">
            Week {week.week_number}
          </span>
        )}
      </div>

      <div className="mx-auto w-full max-w-[560px] space-y-6">
        <AddPlayerForm token={token} />

        {week && unpaid.length > 0 && (
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-barlow-condensed)] text-xl">
              Who to collect from — Week {week.week_number}
            </h2>
            <ul className="space-y-2">
              {unpaid.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-primary)]">
                    {names.get(entry.player_id) ?? 'Unknown'}{' '}
                    <span className="tabular text-[var(--money-amber-500)]">
                      ${(entry.buy_in_cents / 100).toFixed(2)}
                    </span>
                  </span>
                  {/*
                    markPaid is the ledger event behind the Paid chip
                    flipping outline -> solid (DESIGN.md §7). Money action,
                    so this is the `money` Button variant — never the hot
                    accent, which DESIGN.md §2 reserves for live/won.

                    Wrapped in an inline server action (rather than bound
                    directly) only because a form action must return void —
                    markPaid's { ok, reason } result isn't consumed here. A
                    server action is its own POST endpoint regardless of how
                    it's wired up — this page's notFound() gate above does
                    not protect it. markPaid takes the token, not a
                    commissioner id: it re-resolves and re-checks the
                    commissioner itself before writing anything, so
                    confirmed_by is always the re-verified viewer's id,
                    never a value trusted from this render.
                  */}
                  <form
                    action={async () => {
                      'use server';
                      await markPaid(token, entry.id);
                    }}
                  >
                    <Button type="submit" variant="money">
                      Mark paid
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <PaidStrip lines={lines} />

        <Roster token={token} members={roster} />

        {week && (
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-barlow-condensed)] text-xl">Picks</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {locked ? 'Locked' : 'Open'}
              {week.lock_override
                ? ' — by you'
                : lockAtMs === null
                  ? ' — no schedule yet'
                  : ` — ${locked ? 'closed' : 'closes'} ${deadlineLabel(lockAtMs, pool.settings.timezone)}`}
            </p>
            <p className="mt-1 mb-3 text-sm text-[var(--text-tertiary)]">
              Everyone&apos;s picks and tiebreaker close together, when the first game that counts
              kicks off. Override it here if you need to.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* Colourless on purpose: the hot accent means live and wins,
                  and closing everyone's picks is neither. */}
              <form
                action={async () => {
                  'use server';
                  await setWeekLock(token, locked ? 'open' : 'locked');
                }}
              >
                <Button type="submit" variant="ghost">
                  {locked ? 'Reopen picks' : 'Lock picks now'}
                </Button>
              </form>
              {week.lock_override && (
                <form
                  action={async () => {
                    'use server';
                    await setWeekLock(token, null);
                  }}
                >
                  <Button type="submit" variant="ghost">
                    Back to automatic
                  </Button>
                </form>
              )}
            </div>
          </Panel>
        )}

        {week && allGames.length > 0 && (
          <Panel>
            <h2 className="mb-3 font-[family-name:var(--font-barlow-condensed)] text-xl">
              Games that count
            </h2>
            <p className="mb-3 text-sm text-[var(--text-tertiary)]">
              Picks close at the earliest kickoff below. Drop a game nobody could reasonably pick —
              a midweek opener, a Friday game abroad — and the deadline moves to the next one. It
              stops counting for everybody, so nobody gains a game the rest could not enter.
            </p>
            <ul className="space-y-2">
              {[...allGames]
                .sort((a, b) => Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at))
                .map((game) => {
                  const counts = !excludedIds.includes(game.id);
                  return (
                    <li
                      key={game.id}
                      className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0"
                    >
                      <span className={counts ? '' : 'text-[var(--text-tertiary)] line-through'}>
                        {game.away_abbr} @ {game.home_abbr}
                        <span className="ml-2 text-sm text-[var(--text-tertiary)] tabular-nums">
                          {kickoffLabel(game.kickoff_at, pool.settings.timezone)}
                        </span>
                      </span>
                      <form
                        action={async () => {
                          'use server';
                          await setGameCounts(token, game.id, !counts);
                        }}
                      >
                        <Button type="submit" variant="ghost">
                          {counts ? 'Drop' : 'Add back'}
                        </Button>
                      </form>
                    </li>
                  );
                })}
            </ul>
          </Panel>
        )}

        <Panel>
          <h2 className="mb-3 font-[family-name:var(--font-barlow-condensed)] text-xl">Agent</h2>
          <p className="mb-3 text-sm text-[var(--text-tertiary)]">
            The pool runs itself on a schedule. Use this only if you don&apos;t want to wait for the
            next automatic run — after adding a late player, for example.
          </p>
          <form
            action={async () => {
              'use server';
              await forceTick(token);
            }}
          >
            <Button type="submit" variant="primary">
              Run now
            </Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
