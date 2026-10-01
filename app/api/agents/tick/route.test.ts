import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agents/wire', () => ({
  runTickForAllPools: vi.fn(),
}));

import { POST } from '@/app/api/agents/tick/route';
import { runTickForAllPools } from '@/lib/agents/wire';

const runTickForAllPoolsMock = runTickForAllPools as unknown as ReturnType<typeof vi.fn>;

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/agents/tick', { method: 'POST', headers });
}

describe('POST /api/agents/tick', () => {
  beforeEach(() => {
    runTickForAllPoolsMock.mockReset();
    runTickForAllPoolsMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 500 and never calls runTickForAllPools when TICK_SECRET is not configured', async () => {
    vi.stubEnv('TICK_SECRET', '');

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(runTickForAllPoolsMock).not.toHaveBeenCalled();
  });

  it('returns 401 and never calls runTickForAllPools for the wrong bearer token', async () => {
    vi.stubEnv('TICK_SECRET', 'correct-secret');

    const res = await POST(request({ authorization: 'Bearer wrong-secret' }));

    expect(res.status).toBe(401);
    expect(runTickForAllPoolsMock).not.toHaveBeenCalled();
  });

  it('returns 200 with the reports payload for the correct bearer token', async () => {
    vi.stubEnv('TICK_SECRET', 'correct-secret');
    runTickForAllPoolsMock.mockResolvedValue({
      pool1: { claimed: true, actions: 2, execution: { performed: 2, skipped: 0, failed: 0, errors: [] } },
    });

    const res = await POST(request({ authorization: 'Bearer correct-secret' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      reports: {
        pool1: { claimed: true, actions: 2, execution: { performed: 2, skipped: 0, failed: 0, errors: [] } },
      },
    });
  });

  it('returns 401, not a crash, when the authorization header is missing entirely', async () => {
    vi.stubEnv('TICK_SECRET', 'correct-secret');

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(runTickForAllPoolsMock).not.toHaveBeenCalled();
  });
});
