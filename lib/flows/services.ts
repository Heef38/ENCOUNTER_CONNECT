import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult } from '@/lib/scheduling/types';
import type {
  Flow,
  FlowWithSteps,
  FlowWithStats,
  FlowStep,
  CreateFlowInput,
  UpdateFlowInput,
  CreateFlowStepInput,
  UpdateFlowStepInput,
  ReorderFlowStepsInput,
} from './types';
import { queryFlows, queryFlowById } from './queries';

// ── Flows ─────────────────────────────────────────────────────

export async function listFlows(
  supabase: SupabaseClient,
  campusId?: string,
): Promise<ServiceResult<FlowWithStats[]>> {
  const { data, error } = await queryFlows(supabase, campusId);
  if (error) return { success: false, error: error.message };

  // Enrich with step counts
  const flowIds = (data ?? []).map((f) => f.id as string);
  if (flowIds.length === 0) return { success: true, data: [] };

  const { data: stepCounts, error: stepErr } = await supabase
    .from('flow_steps')
    .select('flow_id')
    .in('flow_id', flowIds);

  if (stepErr) return { success: false, error: stepErr.message };

  const countMap = (stepCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    const fid = row.flow_id as string;
    acc[fid] = (acc[fid] ?? 0) + 1;
    return acc;
  }, {});

  const flows: FlowWithStats[] = (data ?? []).map((f) => ({
    ...(f as unknown as Flow),
    campus: (f as { campus: { id: string; name: string } | null }).campus ?? null,
    step_count: countMap[f.id] ?? 0,
  }));

  return { success: true, data: flows };
}

export async function getFlow(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<FlowWithSteps>> {
  const { data, error } = await queryFlowById(supabase, id);
  if (error) return { success: false, error: error.message };

  // Flatten the lesson_links join (each row has { order_index, lesson })
  // into step.lessons[] sorted by the join's order_index.
  interface RawLessonLink {
    order_index: number;
    lesson: {
      id: string;
      title: string;
      slug: string | null;
      video_url: string | null;
      body: string | null;
      order_index: number;
    } | null;
  }
  interface RawStep extends Omit<FlowStep, 'lessons'> {
    lesson_links?: RawLessonLink[];
  }
  interface RawFlow extends Omit<FlowWithSteps, 'steps'> {
    steps: RawStep[];
  }

  const raw = data as unknown as RawFlow;
  const steps: FlowStep[] = (raw.steps ?? []).map((s) => {
    const links: RawLessonLink[] = s.lesson_links ?? [];
    const lessons = links
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .map((l) => l.lesson)
      .filter((l): l is NonNullable<RawLessonLink['lesson']> => l !== null);
    const { lesson_links: _omit, ...rest } = s;
    void _omit;
    return { ...rest, lessons };
  });

  return { success: true, data: { ...raw, steps } };
}

export async function createFlow(
  supabase: SupabaseClient,
  input: CreateFlowInput,
): Promise<ServiceResult<Flow>> {
  if (!input.name?.trim()) {
    return { success: false, error: 'Flow name is required.' };
  }

  // Resolve church_id: prefer input override, otherwise pull from current user's profile.
  let churchId = input.church_id ?? null;
  if (!churchId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };
    const { data: profile } = await supabase
      .from('profiles')
      .select('church_id')
      .eq('id', user.id)
      .maybeSingle();
    churchId = (profile as { church_id: string | null } | null)?.church_id ?? null;
  }
  if (!churchId) {
    return {
      success: false,
      error: 'No church associated with your account. Specify church_id explicitly.',
    };
  }

  const { data, error } = await supabase
    .from('flows')
    .insert({
      church_id: churchId,
      name: input.name.trim(),
      description: input.description ?? null,
      campus_id: input.campus_id ?? null,
      is_default: input.is_default ?? false,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Flow };
}

export async function updateFlow(
  supabase: SupabaseClient,
  id: string,
  input: UpdateFlowInput,
): Promise<ServiceResult<Flow>> {
  const { data, error } = await supabase
    .from('flows')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Flow };
}

// ── Flow Steps ────────────────────────────────────────────────

export async function createFlowStep(
  supabase: SupabaseClient,
  input: CreateFlowStepInput,
): Promise<ServiceResult<FlowStep>> {
  if (!input.title?.trim()) {
    return { success: false, error: 'Step title is required.' };
  }
  const { data, error } = await supabase
    .from('flow_steps')
    .insert({
      flow_id: input.flow_id,
      title: input.title.trim(),
      description: input.description ?? null,
      step_type: input.step_type,
      order_index: input.order_index,
      phase_index: input.phase_index ?? input.order_index,
      appointment_type_id: input.appointment_type_id ?? null,
      assessment_kind: input.assessment_kind ?? null,
      trigger_kind: input.trigger_kind ?? 'previous_complete',
      output_kind: input.output_kind ?? 'advance',
      is_required: input.is_required ?? true,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  if (input.lesson_ids && input.lesson_ids.length > 0) {
    const linkErr = await replaceStepLessons(supabase, data.id as string, input.lesson_ids);
    if (linkErr) return { success: false, error: linkErr };
  }

  return { success: true, data: data as FlowStep };
}

export async function updateFlowStep(
  supabase: SupabaseClient,
  id: string,
  input: UpdateFlowStepInput,
): Promise<ServiceResult<FlowStep>> {
  const { lesson_ids, ...rest } = input;
  const { data, error } = await supabase
    .from('flow_steps')
    .update(rest)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };

  if (lesson_ids !== undefined) {
    const linkErr = await replaceStepLessons(supabase, id, lesson_ids);
    if (linkErr) return { success: false, error: linkErr };
  }

  return { success: true, data: data as FlowStep };
}

/**
 * Replaces the lesson links for a flow step. Returns an error string
 * on failure, or null on success.
 */
async function replaceStepLessons(
  supabase: SupabaseClient,
  flowStepId: string,
  lessonIds: string[],
): Promise<string | null> {
  const { error: delErr } = await supabase
    .from('flow_step_lessons')
    .delete()
    .eq('flow_step_id', flowStepId);
  if (delErr) return delErr.message;

  if (lessonIds.length === 0) return null;

  const rows = lessonIds.map((lid, i) => ({
    flow_step_id: flowStepId,
    lesson_id: lid,
    order_index: i,
  }));
  const { error: insErr } = await supabase.from('flow_step_lessons').insert(rows);
  if (insErr) return insErr.message;
  return null;
}

export async function deleteFlowStep(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<void>> {
  const { error } = await supabase.from('flow_steps').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

export async function reorderFlowSteps(
  supabase: SupabaseClient,
  input: ReorderFlowStepsInput,
): Promise<ServiceResult<void>> {
  const updates = input.step_ids.map((stepId, index) =>
    supabase
      .from('flow_steps')
      .update({ order_index: index })
      .eq('id', stepId)
      .eq('flow_id', input.flow_id),
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) return { success: false, error: failed.error.message };
  return { success: true, data: undefined };
}
