import type { GameRow, PickRow, PlayerRow } from '@/lib/db/types';

export interface RevealedGame {
  gameId: string;
  awayAbbr: string;
  homeAbbr: string;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  /** Names that took the away side, alphabetical. */
  away: string[];
  /** Names that took the home side, alphabetical. */
  home: string[];
  /** Entered the week but never picked this game. */
  missing: string[];
}

/**
 * Who took which side of every game in the week.
 *
 * Only players who actually entered the week appear. Someone who sat the
 * week out is not "missing" a pick — they are not playing — and listing
 * them under every game would bury the handful of people who genuinely
 * left a game blank.
 *
 * A pick naming a team that is not in the game is dropped rather than
 * shown under a heading it does not belong to. That should be impossible
 * (submitPick rejects it), which is exactly why it is not worth inventing
 * a third column for on the reveal screen.
 */
export function revealPicks(
  games: readonly GameRow[],
  players: readonly PlayerRow[],
  picks: readonly PickRow[],
  enteredPlayerIds: ReadonlySet<string>,
): RevealedGame[] {
  const entrants = players
    .filter((player) => enteredPlayerIds.has(player.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const byGame = new Map<string, Map<string, string>>();
  for (const pick of picks) {
    let forGame = byGame.get(pick.game_id);
    if (!forGame) {
      forGame = new Map();
      byGame.set(pick.game_id, forGame);
    }
    forGame.set(pick.player_id, pick.picked_abbr);
  }

  return games.map((game) => {
    const picksForGame = byGame.get(game.id) ?? new Map<string, string>();
    const away: string[] = [];
    const home: string[] = [];
    const missing: string[] = [];

    for (const player of entrants) {
      const abbr = picksForGame.get(player.id);
      if (abbr === game.away_abbr) away.push(player.name);
      else if (abbr === game.home_abbr) home.push(player.name);
      else missing.push(player.name);
    }

    return {
      gameId: game.id,
      awayAbbr: game.away_abbr,
      homeAbbr: game.home_abbr,
      awayTeam: game.away_team,
      homeTeam: game.home_team,
      kickoffAt: game.kickoff_at,
      away,
      home,
      missing,
    };
  });
}
