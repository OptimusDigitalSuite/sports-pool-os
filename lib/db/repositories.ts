import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EntryRow,
  GameRow,
  PickRow,
  PlayerRow,
  PoolRow,
  TiebreakerGuessRow,
  WeekResultRow,
  WeekRow,
  WeekStatus,
} from '@/lib/db/types';

export type NewGame = Omit<GameRow, 'id' | 'updated_at'>;
export type NewPick = Omit<PickRow, 'id' | 'created_at' | 'updated_at'>;
export type NewPlayer = Omit<PlayerRow, 'id' | 'created_at'>;
export type NewWeekResult = Omit<WeekResultRow, 'id'>;

function unwrap<T>(
  result: { data: T | null; error: { code?: string; message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return (result.data ?? []) as T;
}

export interface Repositories {
  pools: {
    get(poolId: string): Promise<PoolRow | null>;
  };
  players: {
    listActive(poolId: string): Promise<PlayerRow[]>;
    getByToken(token: string): Promise<PlayerRow | null>;
    getById(playerId: string): Promise<PlayerRow | null>;
    /** Null when the pool already has this email — that is what makes re-pasting a roster safe. */
    create(player: NewPlayer): Promise<PlayerRow | null>;
    /**
     * Records an address for a player who already exists — usually one added
     * by name alone, who the notification agents therefore cannot reach.
     * 'duplicate' when somebody else in the pool already holds it.
     */
    setEmail(playerId: string, email: string): Promise<'ok' | 'duplicate'>;
    /**
     * Soft delete. Their history, picks and past entries stay intact, so a
     * player who returns in November is a flag flip rather than a re-invite.
     */
    setActive(playerId: string, active: boolean): Promise<void>;
  };
  games: {
    listByWeek(season: number, week: number): Promise<GameRow[]>;
    getById(gameId: string): Promise<GameRow | null>;
    upsertMany(games: NewGame[]): Promise<void>;
  };
  weeks: {
    find(poolId: string, season: number, weekNumber: number): Promise<WeekRow | null>;
    getById(weekId: string): Promise<WeekRow | null>;
    /** The pool's current week: highest week number within the pool's own season. */
    latestForPool(poolId: string, season: number): Promise<WeekRow | null>;
    upsert(poolId: string, season: number, weekNumber: number, tiebreakGameId: string | null): Promise<WeekRow>;
    setStatus(weekId: string, status: WeekStatus): Promise<void>;
    /** null restores the automatic first-kickoff deadline. */
    setLockOverride(weekId: string, override: 'locked' | 'open' | null): Promise<void>;
    /** Every week the pool has played this season, ascending by week number. */
    listForSeason(poolId: string, season: number): Promise<WeekRow[]>;
  };
  picks: {
    listByWeek(weekId: string): Promise<PickRow[]>;
    upsert(pick: NewPick): Promise<void>;
  };
  guesses: {
    listByWeek(weekId: string): Promise<TiebreakerGuessRow[]>;
    upsert(playerId: string, weekId: string, predictedTotal: number): Promise<void>;
  };
  entries: {
    listByWeek(weekId: string): Promise<EntryRow[]>;
    getById(entryId: string): Promise<EntryRow | null>;
    /** Idempotent: creates the entry the first time a player participates, no-ops after. */
    ensure(playerId: string, weekId: string, buyInCents: number): Promise<void>;
    markPaid(entryId: string, method: string, confirmedBy: string | null): Promise<void>;
    /** The player's own lock on their card, per week. Reversible by them. */
    setLocked(playerId: string, weekId: string, locked: boolean): Promise<void>;
    /** Only ever an unpaid entry — see the removePlayer action. */
    remove(entryId: string): Promise<void>;
    listForWeeks(weekIds: readonly string[]): Promise<EntryRow[]>;
  };
  weekExclusions: {
    /** Ids of the games in this week that do not count. */
    listByWeek(weekId: string): Promise<string[]>;
    /** Idempotent: excluding an already-excluded game is a no-op. */
    add(weekId: string, gameId: string, reason: string | null): Promise<void>;
    remove(weekId: string, gameId: string): Promise<void>;
  };
  agentRuns: {
    /** True if this run key was claimed by us; false if another tick already holds it. */
    claim(poolId: string, agent: string, runKey: string): Promise<boolean>;
  };
  notifications: {
    /** True if we claimed the right to send; false if it was already sent. */
    claim(playerId: string | null, channel: string, template: string, dedupeKey: string): Promise<boolean>;
    /** Undo a claim whose send failed, so the next tick can retry it. */
    release(dedupeKey: string): Promise<void>;
  };
  weekResults: {
    replaceForWeek(weekId: string, rows: NewWeekResult[]): Promise<void>;
    /** Settled results across many weeks — the season standings read path. */
    listForWeeks(weekIds: readonly string[]): Promise<WeekResultRow[]>;
  };
}

export function createRepositories(client: SupabaseClient): Repositories {
  return {
    pools: {
      async get(poolId) {
        const result = await client.from('pools').select('*').eq('id', poolId).maybeSingle();
        if (result.error) throw new Error(`pools.get failed: ${result.error.message}`);
        return result.data as PoolRow | null;
      },
    },

    players: {
      async listActive(poolId) {
        return unwrap<PlayerRow[]>(
          await client.from('players').select('*').eq('pool_id', poolId).eq('is_active', true).order('name'),
          'players.listActive',
        );
      },
      async getByToken(token) {
        const result = await client.from('players').select('*').eq('magic_token', token).maybeSingle();
        if (result.error) throw new Error(`players.getByToken failed: ${result.error.message}`);
        return result.data as PlayerRow | null;
      },
      async getById(playerId) {
        const result = await client.from('players').select('*').eq('id', playerId).maybeSingle();
        if (result.error) throw new Error(`players.getById failed: ${result.error.message}`);
        return result.data as PlayerRow | null;
      },
      async setActive(playerId, active) {
        const result = await client.from('players').update({ is_active: active }).eq('id', playerId);
        if (result.error) throw new Error(`players.setActive failed: ${result.error.message}`);
      },
      async setEmail(playerId, email) {
        const result = await client.from('players').update({ email }).eq('id', playerId);
        if (result.error) {
          // The partial unique index on (pool_id, lower(email)) fired. Same
          // shape as create(): a duplicate is an answer, not a failure.
          if (result.error.code === '23505') return 'duplicate';
          throw new Error(`players.setEmail failed: ${result.error.message}`);
        }
        return 'ok';
      },
      async create(player) {
        const result = await client.from('players').insert(player).select('*').maybeSingle();
        if (result.error) {
          // The partial unique index on (pool_id, lower(email)) fired: this
          // person is already in the pool. Same shape as agentRuns.claim and
          // notifications.claim, so every duplicate path reads alike.
          if (result.error.code === '23505') return null;
          throw new Error(`players.create failed: ${result.error.message}`);
        }
        if (!result.data) throw new Error('players.create returned no row');
        return result.data as PlayerRow;
      },
    },

    games: {
      async listByWeek(season, week) {
        return unwrap<GameRow[]>(
          await client.from('games').select('*').eq('season', season).eq('week', week).order('kickoff_at'),
          'games.listByWeek',
        );
      },
      async getById(gameId) {
        const result = await client.from('games').select('*').eq('id', gameId).maybeSingle();
        if (result.error) throw new Error(`games.getById failed: ${result.error.message}`);
        return result.data as GameRow | null;
      },
      async upsertMany(games) {
        if (games.length === 0) return;
        const result = await client
          .from('games')
          .upsert(games.map((g) => ({ ...g, updated_at: new Date().toISOString() })), { onConflict: 'external_id' });
        if (result.error) throw new Error(`games.upsertMany failed: ${result.error.message}`);
      },
    },

    weeks: {
      async find(poolId, season, weekNumber) {
        const result = await client
          .from('weeks')
          .select('*')
          .eq('pool_id', poolId)
          .eq('season', season)
          .eq('week_number', weekNumber)
          .maybeSingle();
        if (result.error) throw new Error(`weeks.find failed: ${result.error.message}`);
        return result.data as WeekRow | null;
      },
      async getById(weekId) {
        const result = await client.from('weeks').select('*').eq('id', weekId).maybeSingle();
        if (result.error) throw new Error(`weeks.getById failed: ${result.error.message}`);
        return result.data as WeekRow | null;
      },
      async latestForPool(poolId, season) {
        const result = await client
          .from('weeks')
          .select('*')
          .eq('pool_id', poolId)
          .eq('season', season)
          .order('week_number', { ascending: false })
          .limit(1);
        if (result.error) throw new Error(`weeks.latestForPool failed: ${result.error.message}`);
        const rows = (result.data ?? []) as WeekRow[];
        return rows[0] ?? null;
      },
      async upsert(poolId, season, weekNumber, tiebreakGameId) {
        const result = await client
          .from('weeks')
          .upsert(
            { pool_id: poolId, season, week_number: weekNumber, tiebreak_game_id: tiebreakGameId },
            { onConflict: 'pool_id,season,week_number' },
          )
          .select('*')
          .maybeSingle();
        if (result.error) throw new Error(`weeks.upsert failed: ${result.error.message}`);
        if (!result.data) throw new Error('weeks.upsert returned no row');
        return result.data as WeekRow;
      },
      async setStatus(weekId, status) {
        const result = await client
          .from('weeks')
          .update({ status, frozen_at: status === 'frozen' ? new Date().toISOString() : null })
          .eq('id', weekId)
          .neq('status', 'frozen');
        if (result.error) throw new Error(`weeks.setStatus failed: ${result.error.message}`);
      },
      async setLockOverride(weekId, override) {
        // `.neq('status', 'frozen')` for the same reason setStatus carries it:
        // a settled week is done, and reopening one would put picks back in
        // play against results that have already been paid out.
        const result = await client
          .from('weeks')
          .update({ lock_override: override })
          .eq('id', weekId)
          .neq('status', 'frozen');
        if (result.error) {
          throw new Error(`weeks.setLockOverride failed: ${result.error.message}`);
        }
      },
      async listForSeason(poolId, season) {
        return unwrap<WeekRow[]>(
          await client
            .from('weeks')
            .select('*')
            .eq('pool_id', poolId)
            .eq('season', season)
            .order('week_number', { ascending: true }),
          'weeks.listForSeason',
        );
      },
    },

    picks: {
      async listByWeek(weekId) {
        return unwrap<PickRow[]>(
          await client.from('picks').select('*').eq('week_id', weekId),
          'picks.listByWeek',
        );
      },
      async upsert(pick) {
        const result = await client
          .from('picks')
          .upsert({ ...pick, updated_at: new Date().toISOString() }, { onConflict: 'player_id,game_id' });
        if (result.error) throw new Error(`picks.upsert failed: ${result.error.message}`);
      },
    },

    guesses: {
      async listByWeek(weekId) {
        return unwrap<TiebreakerGuessRow[]>(
          await client.from('tiebreaker_guesses').select('*').eq('week_id', weekId),
          'guesses.listByWeek',
        );
      },
      async upsert(playerId, weekId, predictedTotal) {
        const result = await client
          .from('tiebreaker_guesses')
          .upsert(
            { player_id: playerId, week_id: weekId, predicted_total: predictedTotal, updated_at: new Date().toISOString() },
            { onConflict: 'player_id,week_id' },
          );
        if (result.error) throw new Error(`guesses.upsert failed: ${result.error.message}`);
      },
    },

    entries: {
      async listByWeek(weekId) {
        return unwrap<EntryRow[]>(
          await client.from('entries').select('*').eq('week_id', weekId),
          'entries.listByWeek',
        );
      },
      async listForWeeks(weekIds) {
        // Postgres rejects `in ()`, and an empty week list is the normal
        // state of a pool that has not settled a week yet.
        if (weekIds.length === 0) return [];
        return unwrap<EntryRow[]>(
          await client.from('entries').select('*').in('week_id', [...weekIds]),
          'entries.listForWeeks',
        );
      },
      async getById(entryId) {
        const result = await client.from('entries').select('*').eq('id', entryId).maybeSingle();
        if (result.error) throw new Error(`entries.getById failed: ${result.error.message}`);
        return result.data as EntryRow | null;
      },
      async ensure(playerId, weekId, buyInCents) {
        const result = await client
          .from('entries')
          .upsert(
            { player_id: playerId, week_id: weekId, buy_in_cents: buyInCents },
            { onConflict: 'player_id,week_id', ignoreDuplicates: true },
          );
        if (result.error) throw new Error(`entries.ensure failed: ${result.error.message}`);
      },
      async remove(entryId) {
        const result = await client.from('entries').delete().eq('id', entryId);
        if (result.error) throw new Error(`entries.remove failed: ${result.error.message}`);
      },
      async setLocked(playerId, weekId, locked) {
        const result = await client
          .from('entries')
          .update({ locked_at: locked ? new Date().toISOString() : null })
          .eq('player_id', playerId)
          .eq('week_id', weekId);
        if (result.error) throw new Error(`entries.setLocked failed: ${result.error.message}`);
      },
      async markPaid(entryId, method, confirmedBy) {
        const result = await client
          .from('entries')
          .update({ paid_at: new Date().toISOString(), method, confirmed_by: confirmedBy })
          .eq('id', entryId)
          .is('paid_at', null);
        if (result.error) throw new Error(`entries.markPaid failed: ${result.error.message}`);
      },
    },

    weekExclusions: {
      async listByWeek(weekId) {
        const rows = unwrap<Array<{ game_id: string }>>(
          await client.from('week_exclusions').select('game_id').eq('week_id', weekId),
          'weekExclusions.listByWeek',
        );
        return rows.map((row) => row.game_id);
      },
      async add(weekId, gameId, reason) {
        const result = await client
          .from('week_exclusions')
          .upsert({ week_id: weekId, game_id: gameId, reason }, { onConflict: 'week_id,game_id' });
        if (result.error) throw new Error(`weekExclusions.add failed: ${result.error.message}`);
      },
      async remove(weekId, gameId) {
        const result = await client
          .from('week_exclusions')
          .delete()
          .eq('week_id', weekId)
          .eq('game_id', gameId);
        if (result.error) throw new Error(`weekExclusions.remove failed: ${result.error.message}`);
      },
    },

    agentRuns: {
      async claim(poolId, agent, runKey) {
        const result = await client
          .from('agent_runs')
          .insert({ pool_id: poolId, agent, run_key: runKey, outcome: 'claimed' });
        if (!result.error) return true;
        if (result.error.code === '23505') return false;
        throw new Error(`agentRuns.claim failed: ${result.error.message}`);
      },
    },

    notifications: {
      async claim(playerId, channel, template, dedupeKey) {
        const result = await client
          .from('notifications')
          .insert({ player_id: playerId, channel, template, dedupe_key: dedupeKey });
        if (!result.error) return true;
        if (result.error.code === '23505') return false;
        throw new Error(`notifications.claim failed: ${result.error.message}`);
      },
      async release(dedupeKey) {
        const result = await client.from('notifications').delete().eq('dedupe_key', dedupeKey);
        if (result.error) throw new Error(`notifications.release failed: ${result.error.message}`);
      },
    },

    weekResults: {
      async replaceForWeek(weekId, rows) {
        // Delete first: this is a replace, not a merge. A retry after a player
        // was deactivated must not leave their stale payout row behind, or the
        // week's payouts stop summing to the pot.
        const cleared = await client.from('week_results').delete().eq('week_id', weekId);
        if (cleared.error) throw new Error(`weekResults.replaceForWeek clear failed: ${cleared.error.message}`);
        if (rows.length === 0) return;
        const result = await client
          .from('week_results')
          .upsert(rows, { onConflict: 'week_id,player_id' });
        if (result.error) throw new Error(`weekResults.replaceForWeek failed: ${result.error.message}`);
      },
      async listForWeeks(weekIds) {
        if (weekIds.length === 0) return [];
        return unwrap<WeekResultRow[]>(
          await client.from('week_results').select('*').in('week_id', [...weekIds]),
          'weekResults.listForWeeks',
        );
      },
    },
  };
}
