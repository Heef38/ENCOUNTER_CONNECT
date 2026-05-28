'use server';

import { revalidatePath } from 'next/cache';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { requireConnector } from '@/lib/auth/dal';
import { getConnectorParticipantAccess } from '@/lib/connectors/journey-queries';
import { completeBooking } from '@/lib/scheduling/services/bookings';
import { enqueueMeetingNotes } from '@/lib/notifications/enqueue';
import { recordAudit } from '@/lib/audit/log';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface AuthorizedMeeting {
  ok: true;
  connectorId: string;
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>;
  progress: {
    id: string;
    participant_id: string;
    scheduled_event_id: string | null;
  };
}

/** Loads the meeting's progress row and verifies the connector can write to it. */
async function authorize(
  progressId: string,
): Promise<AuthorizedMeeting | { ok: false; error: string }> {
  const { connectorId } = await requireConnector();
  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  const { data: progress } = await admin
    .from('participant_progress')
    .select('id, participant_id, scheduled_event_id')
    .eq('id', progressId)
    .maybeSingle();
  if (!progress) return { ok: false, error: 'Meeting not found.' };

  const access = await getConnectorParticipantAccess(
    supabase,
    connectorId,
    progress.participant_id as string,
  );
  if (!access.canWrite) return { ok: false, error: 'Not authorized for this participant.' };

  return {
    ok: true,
    connectorId,
    admin,
    progress: {
      id: progress.id as string,
      participant_id: progress.participant_id as string,
      scheduled_event_id: (progress.scheduled_event_id as string | null) ?? null,
    },
  };
}

export async function startMeeting(progressId: string): Promise<ActionResult> {
  const a = await authorize(progressId);
  if (!a.ok) return a;
  await a.admin
    .from('participant_progress')
    .update({ meeting_started_at: new Date().toISOString() })
    .eq('id', progressId)
    .is('meeting_started_at', null);
  return { ok: true };
}

export async function saveMeetingNotes(progressId: string, notes: string): Promise<ActionResult> {
  const a = await authorize(progressId);
  if (!a.ok) return a;
  const { error } = await a.admin
    .from('participant_progress')
    .update({ connector_notes: notes })
    .eq('id', progressId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function completeMeeting(progressId: string, notes: string): Promise<ActionResult> {
  const a = await authorize(progressId);
  if (!a.ok) return a;

  const { error } = await a.admin
    .from('participant_progress')
    .update({ connector_notes: notes, meeting_completed_at: new Date().toISOString() })
    .eq('id', progressId);
  if (error) return { ok: false, error: error.message };

  // Mark the booking completed (best-effort — must not block notes sharing).
  if (a.progress.scheduled_event_id) {
    try {
      await completeBooking(a.admin, a.progress.scheduled_event_id, {
        booking_id: a.progress.scheduled_event_id,
        kind: 'completed_successfully',
        summary: notes || undefined,
      });
    } catch (err) {
      console.error('[meeting] completeBooking failed:', err);
    }
  }

  // Share the notes with the participant (email + SMS). Best-effort.
  try {
    await enqueueMeetingNotes(a.admin, {
      participantId: a.progress.participant_id,
      connectorId: a.connectorId,
      notes,
    });
  } catch (err) {
    console.error('[meeting] enqueueMeetingNotes failed:', err);
  }

  await recordAudit({
    action: 'connector.meeting_completed',
    entity_type: 'participant_progress',
    entity_id: progressId,
    metadata: { participant_id: a.progress.participant_id },
  });

  revalidatePath('/journey');
  revalidatePath('/connector');
  revalidatePath(`/connector/participants/${a.progress.participant_id}`);
  return { ok: true };
}
