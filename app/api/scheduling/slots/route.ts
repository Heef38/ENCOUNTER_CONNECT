import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAvailableSlots } from '@/lib/scheduling/services/slots';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const appointment_type_id = searchParams.get('appointment_type_id');
  const resource_id         = searchParams.get('resource_id') ?? undefined;
  const date_from           = searchParams.get('date_from');
  const date_to             = searchParams.get('date_to');

  if (!appointment_type_id || !date_from || !date_to) {
    return NextResponse.json({ error: 'appointment_type_id, date_from, date_to required' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();
  const result = await getAvailableSlots(supabase, {
    appointment_type_id,
    resource_id,
    date_from: new Date(date_from),
    date_to: new Date(date_to),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Serialize Dates to ISO strings for JSON
  const serialized = result.data.map((s) => ({
    ...s,
    starts_at: s.starts_at.toISOString(),
    ends_at: s.ends_at.toISOString(),
  }));

  return NextResponse.json({ data: serialized });
}
