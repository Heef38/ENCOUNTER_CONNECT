import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { drainNotificationOutbox } from '@/lib/notifications/drain';

/**
 * Drains pending outbox rows. Wire to a frequent cron (every 1–5 minutes)
 * via Vercel Cron, pg_cron, or Supabase scheduled function so notifications
 * land quickly after they're enqueued.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` or ?secret=<secret>.
 */
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization');
  if (header && header === `Bearer ${secret}`) return true;

  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret && querySecret === secret) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = await createServiceRoleClient();
  try {
    const report = await drainNotificationOutbox(admin);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
