import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listAppointmentTypes } from '@/lib/scheduling/services/appointment-types';

export async function GET() {
  const supabase = await createServiceRoleClient();
  const result = await listAppointmentTypes(supabase);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
