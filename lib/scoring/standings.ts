import { gradePick } from '@/lib/scoring/grade';
import type { PlayerStanding, ScoredGame, StandingsInput } from '@/lib/scoring/types';

/** Both sides added, or null if the game has not finished with real scores. */
export function combinedTotal(game: ScoredGame | undefined): number | null {
  if (!game || game.status !== 'final') return null;
  if (game.homeScore === null || game.awayScore === null) return null;
  return game.homeScore + game.awayScore;
}

export function buildStandings(input: StandingsInput): PlayerStanding[] {
  const gamesById = new Map(input.games.map((g) => [g.id, g]));
  const guessByPlayer = new Map(input.guesses.map((g) => [g.playerId, g.predictedTotal]));
  const actualTotal = input.tiebreakGameId
    ? combinedTotal(gamesById.get(input.tiebreakGameId))
    : null;

  const rows: Omit<PlayerStanding, 'rank'>[] = input.players.map((player) => {
    let correct = 0;
    let incorrect = 0;
    let voided = 0;
    let stillAlive = 0;

    for (const pick of input.picks) {
      if (pick.playerId !== player.id) continue;
      const game = gamesById.get(pick.gameId);
      if (!game) continue;
      switch (gradePick(pick, game)) {
        case 'correct':
          correct += 1;
          break;
        case 'incorrect':
          incorrect += 1;
          break;
        case 'void':
          voided += 1;
          break;
        case 'pending':
          stillAlive += 1;
          break;
      }
    }

    const predictedTotal = guessByPlayer.get(player.id) ?? null;
    const tiebreakDelta =
      actualTotal !== null && predictedTotal !== null
        ? Math.abs(actualTotal - predictedTotal)
        : null;

    return { playerId: player.id, name: player.name, correct, incorrect, voided, stillAlive, predictedTotal, tiebreakDelta };
  });

  // Most wins first; then closest tiebreak guess; a missing guess sorts last.
  // Player id is the final key because it is unique and locale-independent —
  // unlike name, which can collide (two players both named "Bill") and whose
  // ordering under `localeCompare` depends on the runtime's ICU data.
  const sorted = [...rows].sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    const aDelta = a.tiebreakDelta ?? Number.POSITIVE_INFINITY;
    const bDelta = b.tiebreakDelta ?? Number.POSITIVE_INFINITY;
    if (aDelta !== bDelta) return aDelta - bDelta;
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const ranked: PlayerStanding[] = [];
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    const tiedWithPrevious =
      previous !== undefined &&
      previous.correct === row.correct &&
      previous.tiebreakDelta === row.tiebreakDelta;
    const rank = tiedWithPrevious ? ranked[index - 1]!.rank : index + 1;
    ranked.push({ ...row, rank });
  });

  return ranked;
}
