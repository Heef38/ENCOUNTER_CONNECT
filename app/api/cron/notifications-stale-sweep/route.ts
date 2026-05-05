import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueStaleReminders } from '@/lib/notifications/enqueue';

/**
 * Daily cron entry point for the stale-step sweep. Wire this up via either
 * Vercel Cron, pg_cron, or a Supabase scheduled function.
 *
 * Auth: requires either
 *   1. The Vercel Cron `Authorization: Bearer ${CRON_SECRET}` header, OR
 *   2. ?secret=<CRON_SECRET> query param (handy for manual testing)
 *
 * Set CRON_SECRET in your env. Without it set, the endpoint refuses to run.
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
  const report = await enqueueStaleReminders(admin);
  return NextResponse.json({ ok: true, report });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
