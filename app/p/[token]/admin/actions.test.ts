import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const pool = {
  id: 'pool1',
  name: 'Sunday Money',
  season: 2026,
  buy_in_cents: 1000,
  settings: { autopick_enabled: true, provider: 'espn' as const, timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};

const otherPool = {
  id: 'pool2',
  name: 'The Other Pool',
  season: 2026,
  buy_in_cents: 500,
  settings: { autopick_enabled: false, provider: 'espn' as const, timezone: 'America/Chicago', cashtag: null },
  created_at: '',
};

const commissioner = {
  id: 'commish1',
  pool_id: 'pool1',
  name: 'Bill',
  email: null,
  phone: null,
  magic_token: 'commish-tok',
  is_commissioner: true,
  is_active: true,
  created_at: '',
};

const regularPlayer = {
  id: 'player1',
  pool_id: 'pool1',
  name: 'Kenneth',
  email: null,
  phone: null,
  magic_token: 'player-tok',
  is_commissioner: false,
  is_active: true,
  created_at: '',
};

/** Same is_commissioner shape, but the pool row it belongs to is pool2. */
const otherPoolCommissioner = {
  id: 'commish2',
  pool_id: 'pool2',
  name: 'Someone Else',
  email: null,
  phone: null,
  magic_token: 'other-commish-tok',
  is_commissioner: true,
  is_active: true,
  created_at: '',
};

let viewer: typeof commissioner | typeof regularPlayer | null = commissioner;

const insertMock = vi.fn(async () => ({ error: null }));
/** Mirrors repositories.players.create: the row on success, null on duplicate. */
type CreatedPlayer = Record<string, unknown> | null;
/**
 * Distinct ids per call, the way Postgres assigns them. A fixed id would make
 * every per-player dedupe key identical and quietly hide a real collision.
 */
let createdCount = 0;
const createdRow = async (player: Record<string, unknown>): Promise<CreatedPlayer> => {
  createdCount += 1;
  return { ...player, id: `new${createdCount}`, created_at: '' };
};
const createMock = vi.fn(createdRow);
const claimMock = vi.fn(async () => true);
const releaseMock = vi.fn(async () => {});
const sendMock = vi.fn(async () => ({ ok: true }) as { ok: boolean; reason?: string });
let mailConfigured = true;

vi.mock('@/lib/notify/configured', () => ({
  createConfiguredChannel: () => ({
    channel: { name: 'email', send: sendMock },
    configured: mailConfigured,
  }),
}));
let latestWeek: { id: string; pool_id: string; status: string } | null = {
  id: 'week-in-pool1',
  pool_id: 'pool1',
  status: 'open',
};
let weekEntries: Array<{ id: string; player_id: string; paid_at: string | null }> = [];
const ensureMock = vi.fn(async () => {});
const removeEntryMock = vi.fn(async () => {});
const setActiveMock = vi.fn(async () => {});
const setEmailMock = vi.fn(async () => 'ok' as 'ok' | 'duplicate');
const playersById = new Map<string, { id: string; pool_id: string; name: string }>([
  ['player1', { id: 'player1', pool_id: 'pool1', name: 'Kenneth' }],
  ['player-in-pool2', { id: 'player-in-pool2', pool_id: 'pool2', name: 'Stranger' }],
]);
const updateMock = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
const markPaidRepoMock = vi.fn(async () => {});
const poolsGet = vi.fn(async (poolId: string) => [pool, otherPool].find((p) => p.id === poolId) ?? null);

const entriesById = new Map<string, { id: string; week_id: string }>([
  ['entry-in-pool1', { id: 'entry-in-pool1', week_id: 'week-in-pool1' }],
  ['entry-in-pool2', { id: 'entry-in-pool2', week_id: 'week-in-pool2' }],
]);
const weeksById = new Map<string, { id: string; pool_id: string }>([
  ['week-in-pool1', { id: 'week-in-pool1', pool_id: 'pool1' }],
  ['week-in-pool2', { id: 'week-in-pool2', pool_id: 'pool2' }],
]);

vi.mock('@/lib/db/client', () => ({
  createServiceClient: () => ({
    from: (_table: string) => ({ insert: insertMock, update: updateMock }),
  }),
}));

vi.mock('@/lib/db/repositories', () => ({
  createRepositories: () => ({
    players: {
      getByToken: async () => viewer,
      create: createMock,
      getById: async (id: string) => playersById.get(id) ?? null,
      setEmail: setEmailMock,
      setActive: setActiveMock,
    },
    notifications: { claim: claimMock, release: releaseMock },
    pools: { get: (poolId: string) => poolsGet(poolId) },
    entries: {
      getById: async (id: string) => entriesById.get(id) ?? null,
      markPaid: markPaidRepoMock,
      listByWeek: async () => weekEntries,
      ensure: ensureMock,
      remove: removeEntryMock,
    },
    weeks: {
      getById: async (id: string) => weeksById.get(id) ?? null,
      latestForPool: async () => latestWeek,
    },
  }),
}));

import { addPlayer, addRoster, forceTick, markPaid, markPlayerPaid, removePlayer, setPlayerEmail, toggleAutopick } from '@/app/p/[token]/admin/actions';

beforeEach(() => {
  viewer = commissioner;
  insertMock.mockClear();
  createMock.mockClear();
  createdCount = 0;
  createMock.mockImplementation(createdRow);
  claimMock.mockClear();
  claimMock.mockImplementation(async () => true);
  releaseMock.mockClear();
  sendMock.mockClear();
  sendMock.mockImplementation(async () => ({ ok: true }));
  mailConfigured = true;
  updateMock.mockClear();
  markPaidRepoMock.mockClear();
  poolsGet.mockClear();
  setEmailMock.mockClear();
  setEmailMock.mockImplementation(async () => 'ok');
  ensureMock.mockClear();
  removeEntryMock.mockClear();
  setActiveMock.mockClear();
  weekEntries = [];
  latestWeek = { id: 'week-in-pool1', pool_id: 'pool1', status: 'open' };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('addPlayer authorization', () => {
  it('refuses an unknown token and performs no write', async () => {
    viewer = null;
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');

    const result = await addPlayer('bogus-tok', 'Kenneth', null);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses a deactivated commissioner and performs no write', async () => {
    viewer = { ...commissioner, is_active: false };
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');

    const result = await addPlayer('commish-tok', 'Kenneth', null);

    expect(result.ok).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('refuses a valid player who is not the commissioner and performs no write', async () => {
    viewer = regularPlayer;
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');

    const result = await addPlayer('player-tok', 'Kenneth', null);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('addPlayer without a configured base URL', () => {
  it('fails clearly instead of handing back an unpasteable invite', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');

    const result = await addPlayer('commish-tok', 'Kenneth', null);

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('NEXT_PUBLIC_BASE_URL') });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('still adds the player and builds a real invite once the base URL is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');

    const result = await addPlayer('commish-tok', 'Kenneth', null);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invite).toContain('https://sports-pool-os.example/p/');
    }
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool_id: commissioner.pool_id,
        is_commissioner: false,
        is_active: true,
      }),
    );
  });

  it('refuses a second player with the same address rather than duplicating them', async () => {
    // Since migration 0004 the pool cannot hold one address twice. The
    // repository reports that as null, and the commissioner should read a
    // sentence rather than a Postgres constraint name.
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');
    createMock.mockImplementation(async () => null);

    const result = await addPlayer('commish-tok', 'Kenneth', 'ken@x.test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('already has that email');
      expect(result.reason).not.toContain('23505');
      expect(result.reason).not.toContain('constraint');
    }
  });

  it('never marks an added player as a commissioner', async () => {
    // A second commissioner would hold the console credential. Adding someone
    // to the roster must never be a privilege escalation.
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');

    await addPlayer('commish-tok', 'Kenneth', null);

    expect(createMock.mock.calls[0]![0]).toMatchObject({ is_commissioner: false });
  });
});

describe('markPaid authorization', () => {
  it('refuses an unknown token and writes nothing', async () => {
    viewer = null;

    const result = await markPaid('bogus-tok', 'entry-in-pool1');

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(markPaidRepoMock).not.toHaveBeenCalled();
  });

  it('refuses a valid player who is not the commissioner and writes nothing', async () => {
    viewer = regularPlayer;

    const result = await markPaid('player-tok', 'entry-in-pool1');

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(markPaidRepoMock).not.toHaveBeenCalled();
  });

  it('refuses an entry belonging to a different pool and writes nothing', async () => {
    viewer = commissioner; // pool1

    const result = await markPaid('commish-tok', 'entry-in-pool2');

    expect(result.ok).toBe(false);
    expect(markPaidRepoMock).not.toHaveBeenCalled();
  });

  it('refuses a commissioner of another pool confirming an entry in this pool', async () => {
    viewer = otherPoolCommissioner; // pool2

    const result = await markPaid('other-commish-tok', 'entry-in-pool1');

    expect(result.ok).toBe(false);
    expect(markPaidRepoMock).not.toHaveBeenCalled();
  });

  it('records the confirming commissioner’s own id as confirmed_by, never null, for an entry in their pool', async () => {
    viewer = commissioner;

    const result = await markPaid('commish-tok', 'entry-in-pool1');

    expect(result).toEqual({ ok: true });
    expect(markPaidRepoMock).toHaveBeenCalledWith('entry-in-pool1', 'cashapp', commissioner.id);
  });
});

describe('toggleAutopick authorization', () => {
  it('refuses a non-commissioner token and writes nothing', async () => {
    viewer = regularPlayer;

    const result = await toggleAutopick('player-tok', true);

    expect(result.ok).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates settings for a valid commissioner', async () => {
    viewer = commissioner;

    const result = await toggleAutopick('commish-tok', true);

    expect(result).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalled();
  });
});

describe('forceTick authorization', () => {
  it('refuses a non-commissioner token and never calls the tick endpoint', async () => {
    viewer = regularPlayer;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await forceTick('player-tok');

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('forceTick without a configured base URL', () => {
  it('fails clearly instead of fetching "undefined/api/agents/tick" and crashing', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    vi.stubEnv('TICK_SECRET', 'shh');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await forceTick('commish-tok');

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('NEXT_PUBLIC_BASE_URL') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the tick endpoint once the base URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');
    vi.stubEnv('TICK_SECRET', 'shh');
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await forceTick('commish-tok');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sports-pool-os.example/api/agents/tick',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('addRoster', () => {
  const roster = ['Bill, bill@x.test', 'Kenneth, ken@x.test'].join(String.fromCharCode(10));

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://sports-pool-os.example');
  });

  it('refuses a non-commissioner and creates nobody', async () => {
    viewer = regularPlayer;
    const result = await addRoster('player-tok', roster);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not authorized') });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('creates every parsed player and reports each one invited', async () => {
    const result = await addRoster('commish-tok', roster);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcomes.map((o) => o.status)).toEqual(['invited', 'invited']);
    }
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('reports a duplicate and keeps going with the rest of the roster', async () => {
    createMock.mockImplementation(async (player) =>
      player.email === 'ken@x.test' ? null : { ...player, id: 'new1', created_at: '' },
    );
    const result = await addRoster('commish-tok', roster);
    if (result.ok) {
      expect(result.outcomes.map((o) => o.status)).toEqual(['invited', 'duplicate']);
    }
  });

  it('hands back the invite text for a player with no address', async () => {
    const result = await addRoster('commish-tok', 'Mike');
    if (result.ok) {
      expect(result.outcomes[0]!.status).toBe('link_only');
      expect(result.outcomes[0]!.invite).toContain('https://sports-pool-os.example/p/');
      expect(result.outcomes[0]!.reason).toContain('no email address');
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not claim delivery when mail is unconfigured, and returns the links instead', async () => {
    // The noop channel answers { ok: true }. Sending through it would report
    // twelve invites delivered when none left the building.
    mailConfigured = false;
    const result = await addRoster('commish-tok', roster);
    if (result.ok) {
      expect(result.outcomes.map((o) => o.status)).toEqual(['link_only', 'link_only']);
      expect(result.outcomes[0]!.reason).toContain('not configured');
      expect(result.outcomes[0]!.invite).toContain('/p/');
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns the invite text when a send fails, so the player is not stranded', async () => {
    sendMock.mockImplementation(async () => ({ ok: false, reason: 'mailbox full' }));
    const result = await addRoster('commish-tok', 'Bill, bill@x.test');
    if (result.ok) {
      expect(result.outcomes[0]!.status).toBe('email_failed');
      expect(result.outcomes[0]!.reason).toBe('mailbox full');
      expect(result.outcomes[0]!.invite).toContain('/p/');
    }
  });

  it('releases the claim on a failed send so a retry can send it', async () => {
    sendMock.mockImplementation(async () => ({ ok: false, reason: 'mailbox full' }));
    await addRoster('commish-tok', 'Bill, bill@x.test');
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('claims per player so one invite cannot suppress another', async () => {
    await addRoster('commish-tok', roster);
    const keys = claimMock.mock.calls.map((c) => (c as unknown as unknown[])[3]);
    expect(new Set(keys).size).toBe(2);
  });

  it('treats a lost claim as already invited and does not send again', async () => {
    claimMock.mockImplementation(async () => false);
    const result = await addRoster('commish-tok', 'Bill, bill@x.test');
    if (result.ok) expect(result.outcomes[0]!.status).toBe('invited');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('surfaces parse errors beside the outcomes', async () => {
    const result = await addRoster('commish-tok', ['Bill, bill@x.test', ', orphan@x.test'].join(String.fromCharCode(10)));
    if (result.ok) {
      expect(result.outcomes).toHaveLength(1);
      expect(result.errors).toEqual([
        { line: 2, text: ', orphan@x.test', reason: 'a name is required' },
      ]);
    }
  });

  it('creates nobody for an empty paste', async () => {
    const result = await addRoster('commish-tok', ['   ', '', ''].join(String.fromCharCode(10)));
    expect(result).toEqual({ ok: true, outcomes: [], errors: [] });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('never adds a roster player as a commissioner', async () => {
    await addRoster('commish-tok', roster);
    for (const call of createMock.mock.calls) {
      expect(call[0]).toMatchObject({ is_commissioner: false });
    }
  });
});

describe('setPlayerEmail', () => {
  it('records an address for a player who joined without one', async () => {
    const result = await setPlayerEmail('commish-tok', 'player1', 'ron@x.test');
    expect(result).toEqual({ ok: true });
    expect(setEmailMock).toHaveBeenCalledWith('player1', 'ron@x.test');
  });

  it('trims and lowercases, so a phone keyboard capital does not make a second person', async () => {
    await setPlayerEmail('commish-tok', 'player1', '  Ron@X.Test  ');
    expect(setEmailMock).toHaveBeenCalledWith('player1', 'ron@x.test');
  });

  it('refuses an address with no @, before touching the database', async () => {
    const result = await setPlayerEmail('commish-tok', 'player1', 'ron at x dot test');
    expect(result).toEqual({ ok: false, reason: "that does not look like an email address" });
    expect(setEmailMock).not.toHaveBeenCalled();
  });

  it('reports a duplicate as a sentence', async () => {
    setEmailMock.mockImplementation(async () => 'duplicate');
    const result = await setPlayerEmail('commish-tok', 'player1', 'taken@x.test');
    expect(result).toEqual({ ok: false, reason: 'somebody in this pool already uses that address' });
  });

  it('refuses a player who belongs to another pool', async () => {
    const result = await setPlayerEmail('commish-tok', 'player-in-pool2', 'ron@x.test');
    expect(result).toEqual({ ok: false, reason: 'that player is not in this pool' });
    expect(setEmailMock).not.toHaveBeenCalled();
  });

  it('refuses a player who is not the commissioner', async () => {
    viewer = regularPlayer;
    const result = await setPlayerEmail('player-tok', 'player1', 'ron@x.test');
    expect(result).toEqual({ ok: false, reason: 'not authorized' });
    expect(setEmailMock).not.toHaveBeenCalled();
  });
});

describe('markPlayerPaid', () => {
  it('enters a player who paid without picking, then marks that entry paid', async () => {
    // Ron paid for a slot and has not opened the app. Entry is created by
    // picking, so without this he is in the pot with no row to mark, and
    // auto-pick will not fill for him either — it refuses to enter anybody.
    ensureMock.mockImplementation(async () => {
      weekEntries = [{ id: 'entry-new', player_id: 'player1', paid_at: null }];
    });

    const result = await markPlayerPaid('commish-tok', 'player1');

    expect(result).toEqual({ ok: true });
    expect(ensureMock).toHaveBeenCalledWith('player1', 'week-in-pool1', 1000);
    expect(markPaidRepoMock).toHaveBeenCalledWith('entry-new', 'cashapp', 'commish1');
  });

  it('does not create a second entry for a player who already has one', async () => {
    weekEntries = [{ id: 'entry-existing', player_id: 'player1', paid_at: null }];

    await markPlayerPaid('commish-tok', 'player1');

    expect(markPaidRepoMock).toHaveBeenCalledWith('entry-existing', 'cashapp', 'commish1');
  });

  it('refuses to enter somebody into a week that is already frozen', async () => {
    // The week has been graded and the pot paid out. Adding an entry now
    // would change a settled pot.
    latestWeek = { id: 'week-in-pool1', pool_id: 'pool1', status: 'frozen' };

    const result = await markPlayerPaid('commish-tok', 'player1');

    expect(result).toEqual({ ok: false, reason: 'that week is frozen and cannot take a new entry' });
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('still records a payment against an existing entry in a frozen week', async () => {
    // Money arriving late is a ledger correction, not a scoring change.
    latestWeek = { id: 'week-in-pool1', pool_id: 'pool1', status: 'frozen' };
    weekEntries = [{ id: 'entry-existing', player_id: 'player1', paid_at: null }];

    expect(await markPlayerPaid('commish-tok', 'player1')).toEqual({ ok: true });
    expect(markPaidRepoMock).toHaveBeenCalledWith('entry-existing', 'cashapp', 'commish1');
  });

  it('refuses a player from another pool', async () => {
    const result = await markPlayerPaid('commish-tok', 'player-in-pool2');
    expect(result).toEqual({ ok: false, reason: 'that player is not in this pool' });
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it('refuses anyone who is not the commissioner', async () => {
    viewer = regularPlayer;
    const result = await markPlayerPaid('player-tok', 'player1');
    expect(result).toEqual({ ok: false, reason: 'not authorized' });
    expect(ensureMock).not.toHaveBeenCalled();
  });
});

describe('removePlayer', () => {
  it('deactivates them and drops their unpaid entry, so the pot stops counting it', async () => {
    weekEntries = [{ id: 'entry-existing', player_id: 'player1', paid_at: null }];

    const result = await removePlayer('commish-tok', 'player1', 'REMOVE');

    expect(result).toEqual({ ok: true });
    expect(removeEntryMock).toHaveBeenCalledWith('entry-existing');
    expect(setActiveMock).toHaveBeenCalledWith('player1', false);
  });

  it('refuses without the typed word, before touching anything', async () => {
    const result = await removePlayer('commish-tok', 'player1', 'remove please');
    expect(result).toEqual({ ok: false, reason: 'type REMOVE to confirm' });
    expect(setActiveMock).not.toHaveBeenCalled();
    expect(removeEntryMock).not.toHaveBeenCalled();
  });

  it('accepts the word with stray whitespace around it', async () => {
    expect(await removePlayer('commish-tok', 'player1', '  REMOVE ')).toEqual({ ok: true });
  });

  it('refuses when they have already paid for the open week', async () => {
    // Deleting a paid entry erases money that actually arrived, and leaving
    // it would keep a departed player in the pot. Either way a person has to
    // decide about a refund first.
    weekEntries = [{ id: 'entry-existing', player_id: 'player1', paid_at: '2026-09-09T00:00:00Z' }];

    const result = await removePlayer('commish-tok', 'player1', 'REMOVE');

    expect(result).toEqual({
      ok: false,
      reason: 'they have paid for this week — settle that first, then remove them',
    });
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('refuses to remove the commissioner themselves', async () => {
    // There is no other way back into the console.
    const result = await removePlayer('commish-tok', 'commish1', 'REMOVE');
    expect(result).toEqual({ ok: false, reason: 'you cannot remove yourself' });
    expect(setActiveMock).not.toHaveBeenCalled();
  });

  it('refuses a player from another pool', async () => {
    const result = await removePlayer('commish-tok', 'player-in-pool2', 'REMOVE');
    expect(result).toEqual({ ok: false, reason: 'that player is not in this pool' });
  });

  it('refuses anyone who is not the commissioner', async () => {
    viewer = regularPlayer;
    expect(await removePlayer('player-tok', 'player1', 'REMOVE')).toEqual({
      ok: false,
      reason: 'not authorized',
    });
  });
});
