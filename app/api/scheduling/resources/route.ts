import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listResources } from '@/lib/scheduling/services/resources';

export async function GET() {
  const supabase = await createServiceRoleClient();
  const result = await listResources(supabase, { is_active: true });
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
