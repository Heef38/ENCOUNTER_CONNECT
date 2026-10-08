import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueWeeklyDigests } from '@/lib/notifications/connect-sweeps';

/**
 * Daily: sends each church's Monday digest on the day it picked, in its own timezone (idempotent per ISO week).
 * Auth: Vercel Cron's `Authorization: Bearer ${CRON_SECRET}`, or ?secret= for manual runs.
 */
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = await createServiceRoleClient();
  const report = await enqueueWeeklyDigests(admin);
  return NextResponse.json({ ok: true, report });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
