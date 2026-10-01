import { notFound } from 'next/navigation';
import { supportsCardLock } from '@/lib/ui/cardLock';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { Panel } from '@/components/ui/Panel';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { loadPlayerWeek } from '@/lib/ui/loadPlayerWeek';
import { isWeekLocked } from '@/lib/services/weekLock';
import { PickList, type PickListItem } from '@/app/p/[token]/PickList';

export const dynamic = 'force-dynamic';

export default async function PicksPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = createServiceClient();
  const repos = createRepositories(client);
  const player = await repos.players.getByToken(token);
  if (!player) notFound();

  const poolRow = await repos.pools.get(player.pool_id);
  if (!poolRow) notFound();

  const currentWeek = await repos.weeks.latestForPool(poolRow.id, poolRow.season);
  if (!currentWeek) notFound();

  const state = await loadPlayerWeek(repos, token, currentWeek.week_number);
  if (!state) notFound();

  // One deadline for the week, computed exactly as the engine computes it —
  // a screen that disagreed with submitPick would render tappable rows that
  // error on every tap.
  const locked = isWeekLocked({
    status: currentWeek.status,
    lockOverride: currentWeek.lock_override,
    kickoffs: state.games.map((game) => game.kickoff_at),
    now: new Date(),
  });

  const items: PickListItem[] = state.games.map((game) => {
    const pick = state.picks.find((p) => p.game_id === game.id);
    return {
      game: {
        id: game.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeAbbr: game.home_abbr,
        awayAbbr: game.away_abbr,
        kickoffAt: game.kickoff_at,
        homeScore: game.home_score,
        awayScore: game.away_score,
        status: game.status,
      },
      pickedAbbr: pick?.picked_abbr ?? null,
      isAuto: pick?.is_auto ?? false,
      locked,
    };
  });

  return (
    <main className="min-h-[100dvh] pt-8">
      <VideoBackdrop intensity="wash" />
      {/* DESIGN.md §8 bans body/caption text on raw, non-scrimmed, non-panel
          video — the wash scrim alone doesn't guarantee contrast for text
          this small. Give the header the same glass treatment as everything
          else on this screen instead of sitting it directly on the backdrop. */}
      <header className="mx-auto w-full max-w-[480px] px-4 pb-4">
        <Panel>
          <h1 className="font-[family-name:var(--font-barlow-condensed)] text-3xl">
            Week {state.week.week_number}
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">{state.player.name}</p>
        </Panel>
      </header>
      <PickList
        token={token}
        weekId={state.week.id}
        items={items}
        initialGuess={state.guess?.predicted_total ?? null}
        timeZone={state.pool.settings.timezone}
        initialLocked={state.entry?.locked_at != null}
        lockAvailable={supportsCardLock(state.entry)}
      />
    </main>
  );
}
