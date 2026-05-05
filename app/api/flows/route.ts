import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listFlows, createFlow } from '@/lib/flows/services';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get('campus_id') ?? undefined;

  const result = await listFlows(supabase, campusId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result.data);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const result = await createFlow(supabase, {
    name:        body.name,
    description: body.description,
    campus_id:   body.campus_id,
    is_default:  body.is_default,
  });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data, { status: 201 });
}
