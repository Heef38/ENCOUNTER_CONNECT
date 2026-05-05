import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAppointmentType } from '@/lib/scheduling/services/appointment-types';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServiceRoleClient();
  const result = await getAppointmentType(supabase, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ data: result.data });
}
