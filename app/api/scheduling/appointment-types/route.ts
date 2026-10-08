import { NextResponse } from 'next/server';
import { listAppointmentTypes } from '@/lib/scheduling/services/appointment-types';
import { requireSchedulingStaff } from '@/lib/scheduling-api/guard';

export async function GET() {
  const gate = await requireSchedulingStaff();
  if (!gate.ok) return gate.response;
  const result = await listAppointmentTypes(gate.supabase);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
