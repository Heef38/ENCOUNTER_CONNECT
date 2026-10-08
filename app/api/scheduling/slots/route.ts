import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAvailableSlots } from '@/lib/scheduling/services/slots';
import { requireSchedulingStaff } from '@/lib/scheduling-api/guard';

export async function GET(req: NextRequest) {
  const gate = await requireSchedulingStaff();
  if (!gate.ok) return gate.response;

  const { searchParams } = req.nextUrl;
  const appointment_type_id = searchParams.get('appointment_type_id');
  const resource_id         = searchParams.get('resource_id') ?? undefined;
  const date_from           = searchParams.get('date_from');
  const date_to             = searchParams.get('date_to');

  if (!appointment_type_id || !date_from || !date_to) {
    return NextResponse.json({ error: 'appointment_type_id, date_from, date_to required' }, { status: 400 });
  }

  // The caller must be able to see the appointment type and the calendar
  // through their own church scope (migration 031) before we compute slots.
  const { data: apptType } = await gate.supabase
    .from('scheduling_appointment_types')
    .select('id')
    .eq('id', appointment_type_id)
    .maybeSingle();
  if (!apptType) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (resource_id) {
    const { data: resource } = await gate.supabase
      .from('scheduling_resources')
      .select('id')
      .eq('id', resource_id)
      .maybeSingle();
    if (!resource) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  // Slots need every booking on the calendar to know what's taken, which a
  // church admin can't read row by row, so the computation itself runs on
  // the service role once access is established.
  const admin = await createServiceRoleClient();
  const result = await getAvailableSlots(admin, {
    appointment_type_id,
    resource_id,
    date_from: new Date(date_from),
    date_to: new Date(date_to),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const serialized = result.data.map((s) => ({
    ...s,
    starts_at: s.starts_at.toISOString(),
    ends_at: s.ends_at.toISOString(),
  }));

  return NextResponse.json({ data: serialized });
}
