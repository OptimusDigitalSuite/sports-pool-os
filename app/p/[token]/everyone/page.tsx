import { notFound } from 'next/navigation';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { Panel } from '@/components/ui/Panel';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { isWeekLocked, weekLockAtMs } from '@/lib/services/weekLock';
import { gamesInWeek } from '@/lib/services/weekGames';
import { deadlineLabel } from '@/lib/ui/clock';
import { revealPicks } from '@/lib/ui/revealPicks';

export const dynamic = 'force-dynamic';

/**
 * Everyone's picks, revealed the moment the week locks.
 *
 * Hidden before then, and hidden by the *server* rather than by a class —
 * the picks are simply not in the response, so there is nothing to read out
 * of the HTML while the week is still open. That is the whole point: this
 * screen would be a cheat sheet if it leaked a minute early.
 */
export default async function EveryonePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const repos = createRepositories(createServiceClient());

  const viewer = await repos.players.getByToken(token);
  if (!viewer || !viewer.is_active) notFound();

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) notFound();

  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) notFound();

  const games = await gamesInWeek(repos, week);
  const locked = isWeekLocked({
    status: week.status,
    lockOverride: week.lock_override,
    kickoffs: games.map((game) => game.kickoff_at),
    now: new Date(),
  });

  return (
    <main className="min-h-[100dvh] pt-8">
      <VideoBackdrop intensity="wash" />
      <header className="mx-auto w-full max-w-[480px] px-4 pb-4">
        <Panel>
          <h1 className="font-[family-name:var(--font-barlow-condensed)] text-3xl">
            Week {week.week_number}
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">Everyone&apos;s picks</p>
        </Panel>
      </header>

      <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
        {!locked ? (
          <Panel>
            <p className="text-[var(--text-primary)]">Hidden until picks lock.</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {(() => {
                const lockAt = weekLockAtMs(games.map((game) => game.kickoff_at));
                return lockAt === null
                  ? 'The schedule for this week has not synced yet.'
                  : `Everyone's picks appear here when picks close — ${deadlineLabel(lockAt, pool.settings.timezone)}.`;
              })()}
            </p>
          </Panel>
        ) : (
          <RevealedList
            games={games}
            players={await repos.players.listActive(pool.id)}
            picks={await repos.picks.listByWeek(week.id)}
            enteredPlayerIds={
              new Set((await repos.entries.listByWeek(week.id)).map((entry) => entry.player_id))
            }
          />
        )}
      </div>
    </main>
  );
}

function RevealedList({
  games,
  players,
  picks,
  enteredPlayerIds,
}: {
  games: Parameters<typeof revealPicks>[0];
  players: Parameters<typeof revealPicks>[1];
  picks: Parameters<typeof revealPicks>[2];
  enteredPlayerIds: ReadonlySet<string>;
}) {
  const rows = revealPicks(games, players, picks, enteredPlayerIds);

  if (rows.length === 0) {
    return (
      <Panel>
        <p className="text-[var(--text-secondary)]">No games in this week yet.</p>
      </Panel>
    );
  }

  return (
    <Panel innerClassName="divide-y divide-[var(--border-hairline)] p-0" data-testid="reveal-rows">
      {rows.map((row) => (
        <section key={row.gameId} className="px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <Side abbr={row.awayAbbr} team={row.awayTeam} names={row.away} />
            <Side abbr={row.homeAbbr} team={row.homeTeam} names={row.home} align="right" />
          </div>
          {row.missing.length > 0 && (
            <p className="mt-2 text-[0.6875rem] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              No pick: {row.missing.join(', ')}
            </p>
          )}
        </section>
      ))}
    </Panel>
  );
}

/** One team's column: who took it, under its abbreviation. */
function Side({
  abbr,
  team,
  names,
  align = 'left',
}: {
  abbr: string;
  team: string;
  names: string[];
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <p className="font-[family-name:var(--font-barlow-condensed)] text-xl font-semibold text-[var(--text-primary)]">
        {abbr}{' '}
        <span className="tabular text-sm font-normal text-[var(--text-tertiary)]">
          {names.length}
        </span>
      </p>
      <p className="sr-only">{team}</p>
      {names.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {names.map((name) => (
            <li key={name} className="text-sm text-[var(--text-secondary)]">
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">—</p>
      )}
    </div>
  );
}
