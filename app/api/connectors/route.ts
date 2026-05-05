import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listConnectorsWithStats, createConnector } from '@/lib/connectors/services';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const result = await listConnectorsWithStats(supabase, {
    campus_id: searchParams.get('campus_id') ?? undefined,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const result = await createConnector(supabase, {
    profile_id:             body.profile_id,
    campus_id:              body.campus_id,
    scheduling_resource_id: body.scheduling_resource_id,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data, { status: 201 });
}
