import { NextResponse } from 'next/server';
import { listResources } from '@/lib/scheduling/services/resources';
import { requireSchedulingStaff } from '@/lib/scheduling-api/guard';

export async function GET() {
  const gate = await requireSchedulingStaff();
  if (!gate.ok) return gate.response;
  const result = await listResources(gate.supabase, { is_active: true });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
