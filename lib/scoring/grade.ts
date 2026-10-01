import type { PickInput, PickOutcome, ScoredGame } from '@/lib/scoring/types';

function isScored(game: ScoredGame): game is ScoredGame & { homeScore: number; awayScore: number } {
  return game.status === 'final' && game.homeScore !== null && game.awayScore !== null;
}

/** The winning abbreviation, or null if the game is unfinished, unscored, or tied. */
export function winnerAbbr(game: ScoredGame): string | null {
  if (!isScored(game)) return null;
  if (game.homeScore === game.awayScore) return null;
  return game.homeScore > game.awayScore ? game.homeAbbr : game.awayAbbr;
}

export function gradePick(pick: PickInput, game: ScoredGame): PickOutcome {
  if (!isScored(game)) return 'pending';
  if (game.homeScore === game.awayScore) return 'void';
  return winnerAbbr(game) === pick.pickedAbbr ? 'correct' : 'incorrect';
}
