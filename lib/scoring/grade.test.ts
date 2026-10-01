import { describe, it, expect } from 'vitest';
import { gradePick, winnerAbbr } from '@/lib/scoring/grade';
import type { PickInput, ScoredGame } from '@/lib/scoring/types';

const game = (over: Partial<ScoredGame> = {}): ScoredGame => ({
  id: 'g1',
  homeAbbr: 'MIN',
  awayAbbr: 'GB',
  homeScore: null,
  awayScore: null,
  status: 'scheduled',
  ...over,
});

const pick = (abbr: string): PickInput => ({
  playerId: 'p1',
  gameId: 'g1',
  pickedAbbr: abbr,
  isAuto: false,
});

describe('winnerAbbr', () => {
  it('returns null while the game is unfinished', () => {
    expect(winnerAbbr(game({ status: 'in_progress', homeScore: 10, awayScore: 3 }))).toBeNull();
  });

  it('returns null for a finished tie', () => {
    expect(winnerAbbr(game({ status: 'final', homeScore: 17, awayScore: 17 }))).toBeNull();
  });

  it('returns the higher-scoring side', () => {
    expect(winnerAbbr(game({ status: 'final', homeScore: 24, awayScore: 20 }))).toBe('MIN');
    expect(winnerAbbr(game({ status: 'final', homeScore: 20, awayScore: 24 }))).toBe('GB');
  });
});

describe('gradePick', () => {
  it('is pending before the game finishes', () => {
    expect(gradePick(pick('MIN'), game({ status: 'in_progress', homeScore: 21, awayScore: 0 }))).toBe('pending');
  });

  it('is correct when the picked team won', () => {
    expect(gradePick(pick('MIN'), game({ status: 'final', homeScore: 24, awayScore: 20 }))).toBe('correct');
  });

  it('is incorrect when the picked team lost', () => {
    expect(gradePick(pick('GB'), game({ status: 'final', homeScore: 24, awayScore: 20 }))).toBe('incorrect');
  });

  it('is void for a tie game, for everyone', () => {
    const tie = game({ status: 'final', homeScore: 17, awayScore: 17 });
    expect(gradePick(pick('MIN'), tie)).toBe('void');
    expect(gradePick(pick('GB'), tie)).toBe('void');
  });

  it('is pending when a final game somehow has no scores', () => {
    expect(gradePick(pick('MIN'), game({ status: 'final' }))).toBe('pending');
  });
});
