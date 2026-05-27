/**
 * Flow Engine
 *
 * Handles participant journey progression:
 * - Initialize progress records when a participant enters a flow
 * - Determine the current active step
 * - Advance a participant through steps
 * - Check if a schedule step has been fulfilled by a completed booking
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult } from '@/lib/scheduling/types';
import type { ParticipantProgress, ProgressStatus } from '@/lib/participants/types';
import type { FlowStep } from './types';

// ── Initialize ────────────────────────────────────────────────

/**
 * Creates a `participant_progress` row for every step in the flow.
 * Steps in the lowest-numbered phase start as `in_progress` (the
 * participant can act on any of them); the rest start as `pending`.
 *
 * Safe to call multiple times — uses upsert with ignoreDuplicates so
 * existing rows aren't reset.
 */
export async function initializeParticipantProgress(
  supabase: SupabaseClient,
  participantId: string,
  flowId: string,
): Promise<ServiceResult<ParticipantProgress[]>> {
  const { data: steps, error: stepErr } = await supabase
    .from('flow_steps')
    .select('id, phase_index')
    .eq('flow_id', flowId)
    .order('phase_index')
    .order('order_index');

  if (stepErr) return { success: false, error: stepErr.message };
  if (!steps || steps.length === 0) {
    return { success: false, error: 'Flow has no steps.' };
  }

  const firstPhase = (steps[0] as { phase_index: number }).phase_index;
  const rows = steps.map((s) => ({
    participant_id: participantId,
    flow_step_id: s.id,
    status: ((s as { phase_index: number }).phase_index === firstPhase
      ? 'in_progress'
      : 'pending') as ProgressStatus,
  }));

  const { data, error } = await supabase
    .from('participant_progress')
    .upsert(rows, { onConflict: 'participant_id,flow_step_id', ignoreDuplicates: true })
    .select();

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as ParticipantProgress[] };
}

// ── Default Flow Resolution ───────────────────────────────────

/**
 * Picks the flow a brand-new participant should be enrolled in: the
 * campus's default flow when one exists, otherwise the church-wide
 * default. Only active flows that actually have steps qualify — a
 * default flow with no steps would create empty progress.
 *
 * Returns null when the church has no usable default configured. Callers
 * should treat that as "leave the journey empty for now" rather than an
 * error: signup must still succeed, and staff can enroll later.
 */
export async function resolveDefaultFlowId(
  supabase: SupabaseClient,
  churchId: string,
  campusId: string | null,
): Promise<string | null> {
  let query = supabase
    .from('flows')
    .select('id, campus_id')
    .eq('church_id', churchId)
    .eq('is_default', true)
    .eq('is_active', true);

  // A campus signup can match either its own campus default or the
  // church-wide (campus_id null) default; a church-wide signup only the latter.
  query = campusId
    ? query.or(`campus_id.eq.${campusId},campus_id.is.null`)
    : query.is('campus_id', null);

  const { data: flows, error } = await query;
  if (error || !flows || flows.length === 0) return null;

  // Prefer a campus-specific default over the church-wide fallback.
  const ranked = [...flows].sort(
    (a, b) =>
      (a.campus_id === campusId ? 0 : 1) - (b.campus_id === campusId ? 0 : 1),
  );

  for (const flow of ranked) {
    const { count } = await supabase
      .from('flow_steps')
      .select('id', { count: 'exact', head: true })
      .eq('flow_id', flow.id);
    if ((count ?? 0) > 0) return flow.id;
  }

  return null;
}

// ── Current Step ──────────────────────────────────────────────

/**
 * Returns the first non-completed, non-skipped required step for
 * a participant in a given flow. Returns null when the flow is
 * complete.
 */
export async function getCurrentStep(
  supabase: SupabaseClient,
  participantId: string,
  flowId: string,
): Promise<ServiceResult<FlowStep | null>> {
  const { data, error } = await supabase
    .from('participant_progress')
    .select(
      `status,
       flow_step:flow_steps!inner(
         id, flow_id, title, description, step_type,
         order_index, appointment_type_id, is_required
       )`,
    )
    .eq('participant_id', participantId)
    .eq('flow_steps.flow_id', flowId)
    .in('status', ['pending', 'in_progress'])
    .order('order_index', { referencedTable: 'flow_steps' })
    .limit(1);

  if (error) return { success: false, error: error.message };

  if (!data || data.length === 0) {
    return { success: true, data: null }; // flow complete
  }

  const step = (data[0] as unknown as { flow_step: FlowStep }).flow_step;
  return { success: true, data: step };
}

// ── Advance ───────────────────────────────────────────────────

/**
 * Marks a flow step as completed for a participant and updates the
 * next step to `in_progress`.
 */
export async function advanceParticipantStep(
  supabase: SupabaseClient,
  participantId: string,
  flowStepId: string,
): Promise<ServiceResult<ParticipantProgress>> {
  // Mark current step completed
  const { data: completed, error: completeErr } = await supabase
    .from('participant_progress')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('participant_id', participantId)
    .eq('flow_step_id', flowStepId)
    .select()
    .single();

  if (completeErr) return { success: false, error: completeErr.message };

  // Find the next pending step in the same flow
  const { data: stepData } = await supabase
    .from('flow_steps')
    .select('flow_id, order_index')
    .eq('id', flowStepId)
    .single();

  if (stepData) {
    const { data: nextStep } = await supabase
      .from('flow_steps')
      .select('id')
      .eq('flow_id', stepData.flow_id)
      .gt('order_index', stepData.order_index)
      .order('order_index')
      .limit(1)
      .single();

    if (nextStep) {
      await supabase
        .from('participant_progress')
        .update({ status: 'in_progress' })
        .eq('participant_id', participantId)
        .eq('flow_step_id', nextStep.id);
    }
  }

  return { success: true, data: completed as ParticipantProgress };
}

// ── Schedule Step Sync ────────────────────────────────────────

/**
 * For `schedule` step types — checks whether the linked booking
 * has been completed and, if so, marks the step complete.
 * Called by the scheduling outcome handler after a booking is completed.
 */
export async function syncScheduleStepFromBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<ServiceResult<void>> {
  // Find any progress record linked to this booking
  const { data: progress, error } = await supabase
    .from('participant_progress')
    .select('id, participant_id, flow_step_id, status')
    .eq('scheduled_event_id', bookingId)
    .eq('status', 'in_progress')
    .limit(1)
    .single();

  if (error || !progress) return { success: true, data: undefined }; // nothing to sync

  await advanceParticipantStep(supabase, progress.participant_id, progress.flow_step_id);
  return { success: true, data: undefined };
}
