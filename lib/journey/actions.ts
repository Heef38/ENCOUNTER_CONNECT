'use server';

import { revalidatePath } from 'next/cache';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { computeAssessmentScore } from '@/lib/assessments/scoring';
import {
  enqueueStepCompletionNotice,
  enqueueMeetingScheduled,
} from '@/lib/notifications/enqueue';
import { proposeConnectorSlots, pickLeastLoadedConnector } from '@/lib/connectors/match';
import { createBooking } from '@/lib/scheduling/services/bookings';
import type {
  AssessmentKind,
  AssessmentQuestion,
  AssessmentCategory,
} from '@/lib/assessments/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Loads a progress row and verifies it belongs to the authenticated
 * participant. Returns the row + the participant's id when authorized.
 */
async function authorizeProgressForCurrentParticipant(progressId: string): Promise<
  | {
      ok: true;
      progress: {
        id: string;
        participant_id: string;
        flow_step_id: string;
        status: string;
      };
      participantId: string;
    }
  | { ok: false; error: string }
> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: progress } = await supabase
    .from('participant_progress')
    .select('id, participant_id, flow_step_id, status')
    .eq('id', progressId)
    .maybeSingle();

  if (!progress) return { ok: false, error: 'Step not found.' };

  const { data: participant } = await supabase
    .from('participants')
    .select('id, profile_id')
    .eq('id', progress.participant_id)
    .maybeSingle();

  if (!participant || participant.profile_id !== session.id) {
    return { ok: false, error: 'Not authorized.' };
  }

  return { ok: true, progress, participantId: participant.id };
}

/**
 * Marks the given progress row completed and promotes the next pending
 * step to in_progress. Updates `participants.current_step_id` to the
 * newly active step (or null when the flow is fully done).
 *
 * Uses the service-role client because participant_progress is RLS-locked
 * to staff writes; ownership is verified before any mutation.
 */
async function completeStepAndAdvance(
  progressId: string,
  participantId: string,
  flowStepId: string,
  auditAction: string,
): Promise<ActionResult> {
  const admin = await createServiceRoleClient();

  const { error: completeErr } = await admin
    .from('participant_progress')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', progressId);

  if (completeErr) return { ok: false, error: completeErr.message };

  const { data: stepData } = await admin
    .from('flow_steps')
    .select('flow_id, phase_index, order_index')
    .eq('id', flowStepId)
    .single();

  let nextStepId: string | null = null;
  if (stepData) {
    // Find every required step in the same phase. The phase is "complete"
    // only when every required step's progress row is in 'completed' status.
    const { data: phaseSteps } = await admin
      .from('flow_steps')
      .select('id, is_required, order_index')
      .eq('flow_id', stepData.flow_id)
      .eq('phase_index', stepData.phase_index);

    const requiredIds = (phaseSteps ?? [])
      .filter((s) => (s as { is_required: boolean }).is_required)
      .map((s) => (s as { id: string }).id);

    let phaseComplete = true;
    if (requiredIds.length > 0) {
      const { data: progressRows } = await admin
        .from('participant_progress')
        .select('flow_step_id, status')
        .eq('participant_id', participantId)
        .in('flow_step_id', requiredIds);

      const completedSet = new Set(
        (progressRows ?? [])
          .filter((p) => (p as { status: string }).status === 'completed')
          .map((p) => (p as { flow_step_id: string }).flow_step_id),
      );
      phaseComplete = requiredIds.every((id) => completedSet.has(id));
    }

    if (phaseComplete) {
      // Promote every step in the next phase (smallest phase_index strictly
      // greater than the current one) to in_progress. Multiple parallel
      // steps may exist there.
      const { data: nextPhase } = await admin
        .from('flow_steps')
        .select('id, phase_index, order_index')
        .eq('flow_id', stepData.flow_id)
        .gt('phase_index', stepData.phase_index)
        .order('phase_index')
        .order('order_index');

      if (nextPhase && nextPhase.length > 0) {
        const nextPhaseIndex = (nextPhase[0] as { phase_index: number }).phase_index;
        const nextStepIds = nextPhase
          .filter((s) => (s as { phase_index: number }).phase_index === nextPhaseIndex)
          .map((s) => (s as { id: string }).id);

        nextStepId = nextStepIds[0] ?? null;

        await admin
          .from('participant_progress')
          .update({ status: 'in_progress' })
          .eq('participant_id', participantId)
          .in('flow_step_id', nextStepIds);
      }
    } else {
      // Phase isn't done yet; current_step_id points at the next sibling
      // still in_progress within this phase, if one exists.
      const stillOpenIds = (phaseSteps ?? [])
        .map((s) => (s as { id: string }).id)
        .filter((id) => id !== flowStepId);
      if (stillOpenIds.length > 0) nextStepId = stillOpenIds[0];
    }
  }

  await admin
    .from('participants')
    .update({ current_step_id: nextStepId })
    .eq('id', participantId);

  await recordAudit({
    action: auditAction,
    entity_type: 'participant_progress',
    entity_id: progressId,
    metadata: { participant_id: participantId, flow_step_id: flowStepId },
  });

  // Fire notification to the assigned connector. Best-effort: failures
  // here must not block the step advance.
  try {
    await enqueueStepCompletionNotice(admin, participantId, flowStepId);
  } catch (err) {
    console.error('[journey] enqueueStepCompletionNotice failed:', err);
  }

  revalidatePath('/journey');
  revalidatePath(`/journey/steps/${progressId}`);
  return { ok: true };
}

export async function selfMarkStepComplete(progressId: string): Promise<ActionResult> {
  const auth = await authorizeProgressForCurrentParticipant(progressId);
  if (!auth.ok) return auth;
  if (auth.progress.status === 'completed') return { ok: true };

  return completeStepAndAdvance(
    progressId,
    auth.participantId,
    auth.progress.flow_step_id,
    'journey.step_complete',
  );
}

/**
 * Links a freshly-created booking to a schedule step's progress row.
 * Used when a participant returns from `/scheduling/new-booking?progress=…`.
 * Verifies ownership and that the booking's appointment_type matches the
 * step's appointment_type before writing.
 */
export async function linkBookingToProgress(
  progressId: string,
  bookingId: string,
): Promise<ActionResult> {
  const auth = await authorizeProgressForCurrentParticipant(progressId);
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  const [stepResult, bookingResult] = await Promise.all([
    supabase
      .from('flow_steps')
      .select('appointment_type_id, step_type')
      .eq('id', auth.progress.flow_step_id)
      .maybeSingle(),
    supabase
      .from('scheduling_bookings')
      .select('id, appointment_type_id, status')
      .eq('id', bookingId)
      .maybeSingle(),
  ]);

  if (!stepResult.data || !bookingResult.data) {
    return { ok: false, error: 'Step or booking not found.' };
  }
  if (stepResult.data.step_type !== 'schedule') {
    return { ok: false, error: 'This step is not a schedule step.' };
  }
  if (
    stepResult.data.appointment_type_id &&
    bookingResult.data.appointment_type_id !== stepResult.data.appointment_type_id
  ) {
    return { ok: false, error: 'Booking type does not match this step.' };
  }

  const { error } = await admin
    .from('participant_progress')
    .update({ scheduled_event_id: bookingId })
    .eq('id', progressId);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'journey.booking_link',
    entity_type: 'participant_progress',
    entity_id: progressId,
    metadata: { booking_id: bookingId },
  });

  // If the booking is already completed, advance the step right now.
  // Otherwise the existing booking-completion path will fire syncScheduleStepFromBooking.
  if (bookingResult.data.status === 'completed') {
    return completeStepAndAdvance(
      progressId,
      auth.participantId,
      auth.progress.flow_step_id,
      'journey.step_complete',
    );
  }

  revalidatePath('/journey');
  revalidatePath(`/journey/steps/${progressId}`);
  return { ok: true };
}

/**
 * Books a meeting at a participant-chosen slot using auto-matched connector
 * selection. Re-runs availability matching server-side (do not trust the
 * client's slot list), picks the least-loaded connector among those free at
 * the chosen time, creates the booking against that connector's resource,
 * sets `participants.assigned_connector_id`, and links the booking to the
 * progress row.
 */
export async function bookMatchedConnectorSlot(
  progressId: string,
  startsAtIso: string,
): Promise<ActionResult> {
  const auth = await authorizeProgressForCurrentParticipant(progressId);
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  // Load the step + participant details we need.
  const { data: step } = await supabase
    .from('flow_steps')
    .select('id, step_type, appointment_type_id, output_kind')
    .eq('id', auth.progress.flow_step_id)
    .maybeSingle();

  if (!step || step.step_type !== 'schedule') {
    return { ok: false, error: 'This step is not a schedule step.' };
  }
  if (!step.appointment_type_id) {
    return { ok: false, error: 'This step has no appointment type configured.' };
  }

  const { data: participant } = await admin
    .from('participants')
    .select('id, campus_id, first_name, last_name, email')
    .eq('id', auth.participantId)
    .maybeSingle();

  if (!participant?.campus_id) {
    return { ok: false, error: 'Participant has no campus assigned.' };
  }

  // Re-run matching server-side (the client's list could be stale).
  const proposals = await proposeConnectorSlots(admin, {
    campusId: participant.campus_id,
    appointmentTypeId: step.appointment_type_id,
  });

  // Find the chosen slot in the fresh proposals. We compare on the wall-clock
  // start; minor formatting drift is tolerated by canonicalizing to ISO.
  const chosenIso = new Date(startsAtIso).toISOString();
  const match = proposals.find((p) => p.starts_at === chosenIso);

  if (!match || match.eligible_connector_ids.length === 0) {
    return {
      ok: false,
      error: 'That time is no longer available. Please pick another slot.',
    };
  }

  const connectorId = await pickLeastLoadedConnector(admin, match.eligible_connector_ids);
  if (!connectorId) {
    return { ok: false, error: 'No connector could be matched at this time.' };
  }

  const { data: connector } = await admin
    .from('connectors')
    .select('id, scheduling_resource_id')
    .eq('id', connectorId)
    .maybeSingle();

  if (!connector?.scheduling_resource_id) {
    return { ok: false, error: 'Matched connector has no scheduling resource.' };
  }

  // Create booking against the connector's resource. Use admin so the
  // participant's RLS doesn't block the insert.
  const bookingResult = await createBooking(admin, {
    appointment_type_id: step.appointment_type_id,
    resource_id: connector.scheduling_resource_id,
    starts_at: chosenIso,
    notes: `Auto-matched first meeting for ${participant.first_name} ${participant.last_name}`,
    attendees: [
      {
        role: 'primary',
        display_name: `${participant.first_name} ${participant.last_name}`,
        email: participant.email ?? undefined,
      },
    ],
    metadata: { auto_matched: true, participant_id: participant.id },
  });

  if (!bookingResult.success) {
    return { ok: false, error: bookingResult.error };
  }

  // Assign connector to participant + link booking to progress.
  await admin
    .from('participants')
    .update({ assigned_connector_id: connectorId })
    .eq('id', participant.id);

  const { error: linkErr } = await admin
    .from('participant_progress')
    .update({ scheduled_event_id: bookingResult.data.id })
    .eq('id', progressId);

  if (linkErr) return { ok: false, error: linkErr.message };

  await recordAudit({
    action: 'journey.connector_auto_matched',
    entity_type: 'participant_progress',
    entity_id: progressId,
    metadata: {
      connector_id: connectorId,
      booking_id: bookingResult.data.id,
      starts_at: chosenIso,
    },
  });

  // Best-effort notifications. Failures here must not block booking.
  try {
    await enqueueMeetingScheduled(admin, {
      participantId: participant.id,
      connectorId,
      bookingId: bookingResult.data.id,
      startsAt: new Date(chosenIso),
    });
  } catch (err) {
    console.error('[journey] enqueueMeetingScheduled failed:', err);
  }

  revalidatePath('/journey');
  revalidatePath(`/journey/steps/${progressId}`);
  return { ok: true };
}

export async function markEventAttended(progressId: string): Promise<ActionResult> {
  const auth = await authorizeProgressForCurrentParticipant(progressId);
  if (!auth.ok) return auth;
  if (auth.progress.status === 'completed') return { ok: true };

  return completeStepAndAdvance(
    progressId,
    auth.participantId,
    auth.progress.flow_step_id,
    'journey.event_attended',
  );
}

/**
 * Saves all assessment responses, inserts an assessment_results row, and
 * advances the flow step. Responses are written with the authenticated
 * client (RLS allows participant self-write); the result row uses
 * service-role since results are staff-write-only.
 */
export async function submitAssessment(
  progressId: string,
  assessmentId: string,
  kind: AssessmentKind,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await authorizeProgressForCurrentParticipant(progressId);
  if (!auth.ok) return auth;

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  const [questionsResult, categoriesResult] = await Promise.all([
    supabase
      .from('assessment_questions')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index'),
    supabase
      .from('assessment_categories')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('order_index'),
  ]);

  const questions = (questionsResult.data ?? []) as AssessmentQuestion[];
  const categories = (categoriesResult.data ?? []) as AssessmentCategory[];

  if (questions.length === 0) {
    return { ok: false, error: 'This assessment has no questions yet.' };
  }

  const responses: {
    assessment_id: string;
    participant_id: string;
    question_id: string;
    response_value: unknown;
  }[] = [];

  for (const q of questions) {
    const fieldName = `q_${q.id}`;
    let value: unknown;

    if (q.question_type === 'multi_choice') {
      value = formData.getAll(fieldName).map((v) => String(v));
    } else if (q.question_type === 'boolean') {
      const raw = formData.get(fieldName);
      if (raw === null) {
        value = null;
      } else {
        value = String(raw) === 'true';
      }
    } else if (q.question_type === 'scale') {
      const raw = formData.get(fieldName);
      const n = raw === null || raw === '' ? null : parseInt(String(raw), 10);
      value = Number.isFinite(n as number) ? n : null;
    } else {
      const raw = formData.get(fieldName);
      value = raw === null ? '' : String(raw);
    }

    if (q.is_required) {
      const empty =
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        return { ok: false, error: 'Please answer all required questions.' };
      }
    }

    responses.push({
      assessment_id: assessmentId,
      participant_id: auth.participantId,
      question_id: q.id,
      response_value: value,
    });
  }

  const { error: respErr } = await supabase
    .from('assessment_responses')
    .upsert(responses, { onConflict: 'participant_id,question_id' });

  if (respErr) return { ok: false, error: respErr.message };

  // Compute scores: build a question_id → response_value map first.
  const responseMap = new Map<string, unknown>(
    responses.map((r) => [r.question_id, r.response_value]),
  );
  const computed = computeAssessmentScore(questions, categories, responseMap);

  const { error: resultErr } = await admin
    .from('assessment_results')
    .upsert(
      {
        assessment_id: assessmentId,
        participant_id: auth.participantId,
        computed_score: computed,
      },
      { onConflict: 'assessment_id,participant_id' },
    );

  if (resultErr) return { ok: false, error: resultErr.message };

  await recordAudit({
    action: 'journey.assessment_submit',
    entity_type: 'assessment_definition',
    entity_id: assessmentId,
    metadata: {
      kind,
      participant_id: auth.participantId,
      progress_id: progressId,
      response_count: responses.length,
    },
  });

  return completeStepAndAdvance(
    progressId,
    auth.participantId,
    auth.progress.flow_step_id,
    'journey.assessment_complete',
  );
}
