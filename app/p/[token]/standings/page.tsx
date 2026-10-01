import { notFound } from 'next/navigation';
import { gamesInWeek } from '@/lib/services/weekGames';
import { AutoRefresh } from '@/components/AutoRefresh';
import { StandingsTable } from '@/components/StandingsTable';
import { PaidStrip, type PaidLine } from '@/components/PaidStrip';
import { VideoBackdrop } from '@/components/VideoBackdrop';
import { toLedgerEntry, toStandingsInput } from '@/lib/adapt';
import { createRepositories } from '@/lib/db/repositories';
import { createServiceClient } from '@/lib/db/client';
import { potCents, unpaidLines } from '@/lib/ledger/payouts';
import { buildStandings } from '@/lib/scoring/standings';
import { buildSeasonStandings } from '@/lib/scoring/seasonStandings';
import { SeasonTable } from '@/components/SeasonTable';

export const dynamic = 'force-dynamic';

export default async function StandingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = createServiceClient();
  const repos = createRepositories(client);

  const viewer = await repos.players.getByToken(token);
  // Matches loadPlayerWeek's gate — a deactivated player's link stops
  // working everywhere, not just on picks.
  if (!viewer || !viewer.is_active) notFound();

  const pool = await repos.pools.get(viewer.pool_id);
  if (!pool) notFound();

  // The pool's current week — consolidated in one tested place so the
  // season filter can't drift out of sync with a hand-written query.
  const week = await repos.weeks.latestForPool(pool.id, pool.season);
  if (!week) notFound();

  const [players, games, picks, guesses, entries] = await Promise.all([
    repos.players.listActive(pool.id),
    gamesInWeek(repos, week),
    repos.picks.listByWeek(week.id),
    repos.guesses.listByWeek(week.id),
    repos.entries.listByWeek(week.id),
  ]);

  const rows = buildStandings(toStandingsInput({ players, games, picks, guesses, week }));

  // DESIGN.md §7: "Tiebreak line: appears only once the week's last game
  // has kicked off" — kickoff, not settlement. The column used to gate on
  // combinedTotal(...) !== null, which only turns true once that game is
  // *final*, hiding the guess for the entire multi-hour window it's most
  // relevant (during the game everyone's watching it against).
  const tiebreakGame = games.find((g) => g.id === week.tiebreak_game_id);
  const tiebreakStarted = tiebreakGame ? tiebreakGame.status !== 'scheduled' : false;
  const livePulse = games.some((g) => g.status === 'in_progress');

  // Every entry counts toward the pot, paid or not — entering is an
  // obligation. Only the unpaid get a pre-filled Cash App link.
  const ledgerEntries = entries.map(toLedgerEntry);
  const pot = potCents(ledgerEntries);
  const unpaid = new Map(unpaidLines(ledgerEntries, pool.settings.cashtag).map((u) => [u.playerId, u]));
  const names = new Map(players.map((p) => [p.id, p.name]));

  // Season table reads only settled weeks: week_results rows exist once a
  // week has been frozen, so a week in progress never moves the table.
  const seasonWeeks = await repos.weeks.listForSeason(pool.id, pool.season);
  const seasonWeekIds = seasonWeeks.map((w) => w.id);
  const [seasonEntries, seasonResults] = await Promise.all([
    repos.entries.listForWeeks(seasonWeekIds),
    repos.weekResults.listForWeeks(seasonWeekIds),
  ]);
  const seasonRows = buildSeasonStandings(players, seasonEntries, seasonResults);

  const lines: PaidLine[] = ledgerEntries.map((entry) => ({
    playerId: entry.playerId,
    name: names.get(entry.playerId) ?? 'Unknown',
    paid: entry.paidAt !== null,
    owedCents: entry.buyInCents,
    payLink: unpaid.get(entry.playerId)?.payLink ?? null,
  }));

  return (
    // pb-24 (not pb-16), matching the picks page — the fixed nav is ~86px
    // tall with env(safe-area-inset-bottom), so pb-16 (64px) let the last
    // chips hide behind it on notched iPhones.
    <main className="min-h-[100dvh] px-4 pt-8 pb-24">
      <VideoBackdrop intensity="full" />
      {/* AutoRefresh (components/AutoRefresh.tsx) is what makes this page
          genuinely live: force-dynamic alone only re-renders on a fresh
          navigation, which is why livePulse and the standings reorder view
          transition (StandingsTable.tsx's per-row view-transition-name)
          used to be dormant — nothing ever called router.refresh() to give
          either one a reason to fire. */}
      <AutoRefresh>
        <StandingsTable
          rows={rows}
          potCents={pot}
          tiebreakStarted={tiebreakStarted}
          viewerId={viewer.id}
          livePulse={livePulse}
        />
      </AutoRefresh>
      <PaidStrip lines={lines} />
      <SeasonTable rows={seasonRows} viewerId={viewer.id} season={pool.season} />
    </main>
  );
}
