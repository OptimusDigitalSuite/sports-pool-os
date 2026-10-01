import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// A freeze tick makes one model call plus a send per player; the default
// serverless budget is not enough, and an abort mid-recap wastes the work.
export const maxDuration = 60;

function secretMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (header === null) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The endpoint Supabase pg_cron hits every five minutes, and the one the
 * commissioner console's Force Tick button calls.
 *
 * Guarded by a shared secret rather than a user session: the caller is a
 * database cron job, not a person.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.TICK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'TICK_SECRET is not configured' }, { status: 500 });
  }
  if (!secretMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { runTickForAllPools } = await import('@/lib/agents/wire');
  const reports = await runTickForAllPools();
  return NextResponse.json({ ok: true, reports });
}
