// APP-SPECIFIC: Cron endpoint for processing due reminders.
// Wired to Vercel Cron (see vercel.json) on a 5-minute schedule.
// Protect with CRON_SECRET to prevent unauthorized invocations.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { processDueReminders } from '@/lib/scheduling/services/reminders';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get('authorization');
  if (header && header === `Bearer ${secret}`) return true;

  // Legacy header used before Vercel Cron wiring.
  if (req.headers.get('x-cron-secret') === secret) return true;

  const querySecret = req.nextUrl.searchParams.get('secret');
  if (querySecret && querySecret === secret) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const result = await processDueReminders(supabase);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
