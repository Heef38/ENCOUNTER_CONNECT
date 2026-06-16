import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueAvailabilityReminders } from '@/lib/notifications/enqueue';

/**
 * Weekly cron entry point: reminds connectors (and connector teams) who have
 * no availability set for the near future to fill it in. Enqueues outbox rows;
 * the notifications-send cron delivers them.
 *
 * Auth: requires either the `Authorization: Bearer ${CRON_SECRET}` header
 * (sent automatically by Vercel Cron) or `?secret=<CRON_SECRET>` for manual
 * testing. Without CRON_SECRET set, the endpoint refuses to run.
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
  const report = await enqueueAvailabilityReminders(admin);
  return NextResponse.json({ ok: true, report });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
