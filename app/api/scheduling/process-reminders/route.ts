// APP-SPECIFIC: Cron endpoint for processing due reminders.
// Call this on a schedule (e.g. every 5 minutes via Vercel Cron or Supabase pg_cron).
// Protect with CRON_SECRET to prevent unauthorized invocations.

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { processDueReminders } from '@/lib/scheduling/services/reminders';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const result = await processDueReminders(supabase);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ data: result.data });
}
