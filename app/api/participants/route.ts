import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listParticipants, createParticipant } from '@/lib/participants/services';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);

  const result = await listParticipants(supabase, {
    campus_id:    searchParams.get('campus_id') ?? undefined,
    status:       searchParams.get('status') as never ?? undefined,
    connector_id: searchParams.get('connector_id') ?? undefined,
    search:       searchParams.get('search') ?? undefined,
    limit:        searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
    offset:       searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const result = await createParticipant(supabase, {
    first_name:            body.first_name,
    last_name:             body.last_name,
    email:                 body.email,
    phone:                 body.phone,
    campus_id:             body.campus_id,
    assigned_connector_id: body.assigned_connector_id,
    notes:                 body.notes,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result.data, { status: 201 });
}
