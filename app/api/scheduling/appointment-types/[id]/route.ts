import { NextResponse } from 'next/server';
import { getAppointmentType } from '@/lib/scheduling/services/appointment-types';
import { requireSchedulingStaff } from '@/lib/scheduling-api/guard';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSchedulingStaff();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const result = await getAppointmentType(gate.supabase, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ data: result.data });
}
