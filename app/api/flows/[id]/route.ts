import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getFlow,
  updateFlow,
  createFlowStep,
  updateFlowStep,
  deleteFlowStep,
  reorderFlowSteps,
} from '@/lib/flows/services';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const result = await getFlow(supabase, id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json(result.data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  // Dispatch sub-actions via action field
  if (body.action === 'add_step') {
    const result = await createFlowStep(supabase, { flow_id: id, ...body.step });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.data, { status: 201 });
  }

  if (body.action === 'update_step') {
    const result = await updateFlowStep(supabase, body.step_id, body.step);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.data);
  }

  if (body.action === 'delete_step') {
    const result = await deleteFlowStep(supabase, body.step_id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reorder_steps') {
    const result = await reorderFlowSteps(supabase, { flow_id: id, step_ids: body.step_ids });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Default: update flow metadata
  const result = await updateFlow(supabase, id, body);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data);
}
