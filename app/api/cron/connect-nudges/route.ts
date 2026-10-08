import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { enqueueContactNudges } from '@/lib/notifications/connect-sweeps';

/**
 * Daily: nudges a connector when someone has waited too long for contact, then the campus admin if the connector hasn't acted.
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
  const report = await enqueueContactNudges(admin);
  return NextResponse.json({ ok: true, report });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
