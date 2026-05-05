'use server';

import { revalidatePath } from 'next/cache';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { requireConnector } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { enqueueMeetingDecision } from '@/lib/notifications/enqueue';
import { getConnectorParticipantAccess } from './journey-queries';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface DecisionContext {
  participantId: string;
  bookingId: string;
  startsAt: string;
}

/**
 * Loads + authorizes a booking for the current connector. The connector
 * must have write access to the participant who scheduled the meeting.
 * Returns the loaded context or an error result.
 */
async function loadAndAuthorize(
  bookingId: string,
): Promise<
  | { ok: true; ctx: DecisionContext; connectorId: string }
  | { ok: false; error: string }
> {
  const { connectorId } = await requireConnector();
  const supabase = await createServerSupabaseClient();

  const { data: booking } = await supabase
    .from('scheduling_bookings')
    .select('id, starts_at, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: 'Booking not found.' };

  // Find the participant_progress row that owns this booking.
  const { data: progress } = await supabase
    .from('participant_progress')
    .select('id, participant_id')
    .eq('scheduled_event_id', bookingId)
    .maybeSingle();
  if (!progress) {
    return { ok: false, error: 'No participant progress is linked to this booking.' };
  }

  const access = await getConnectorParticipantAccess(
    supabase,
    connectorId,
    (progress as { participant_id: string }).participant_id,
  );
  if (!access.canWrite) {
    return { ok: false, error: 'Not authorized to act on this participant.' };
  }

  return {
    ok: true,
    ctx: {
      participantId: (progress as { participant_id: string }).participant_id,
      bookingId,
      startsAt: (booking as { starts_at: string }).starts_at,
    },
    connectorId,
  };
}

export async function connectorConfirmBooking(
  bookingId: string,
): Promise<ActionResult> {
  const auth = await loadAndAuthorize(bookingId);
  if (!auth.ok) return auth;

  const admin = await createServiceRoleClient();
  const { error } = await admin
    .from('scheduling_bookings')
    .update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', auth.ctx.bookingId)
    .eq('status', 'pending_confirmation');

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connector.booking_confirmed',
    entity_type: 'scheduling_booking',
    entity_id: auth.ctx.bookingId,
    metadata: {
      participant_id: auth.ctx.participantId,
      connector_id: auth.connectorId,
    },
  });

  try {
    await enqueueMeetingDecision(admin, {
      participantId: auth.ctx.participantId,
      connectorId: auth.connectorId,
      bookingId: auth.ctx.bookingId,
      startsAt: new Date(auth.ctx.startsAt),
      decision: 'confirmed',
    });
  } catch (err) {
    console.error('[connector] confirm notification failed:', err);
  }

  revalidatePath(`/connector/participants/${auth.ctx.participantId}`);
  return { ok: true };
}

/**
 * Cancels the booking and unlinks it from the participant's progress so
 * they can pick another time. Does not change the participant_progress
 * status (still in_progress on the schedule step) so the picker reopens.
 */
export async function connectorDeclineBooking(
  bookingId: string,
  reason?: string,
): Promise<ActionResult> {
  const auth = await loadAndAuthorize(bookingId);
  if (!auth.ok) return auth;

  const admin = await createServiceRoleClient();

  const { error: cancelErr } = await admin
    .from('scheduling_bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: reason ?? 'Connector declined',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', auth.ctx.bookingId);
  if (cancelErr) return { ok: false, error: cancelErr.message };

  // Unlink booking from progress so the participant sees the picker again.
  const { error: unlinkErr } = await admin
    .from('participant_progress')
    .update({ scheduled_event_id: null })
    .eq('scheduled_event_id', auth.ctx.bookingId);
  if (unlinkErr) return { ok: false, error: unlinkErr.message };

  // Cancel any pending reminders on this booking.
  await admin
    .from('scheduling_reminders')
    .update({ status: 'cancelled' })
    .eq('booking_id', auth.ctx.bookingId)
    .eq('status', 'pending');

  await recordAudit({
    action: 'connector.booking_declined',
    entity_type: 'scheduling_booking',
    entity_id: auth.ctx.bookingId,
    metadata: {
      participant_id: auth.ctx.participantId,
      connector_id: auth.connectorId,
      reason: reason ?? null,
    },
  });

  try {
    await enqueueMeetingDecision(admin, {
      participantId: auth.ctx.participantId,
      connectorId: auth.connectorId,
      bookingId: auth.ctx.bookingId,
      startsAt: new Date(auth.ctx.startsAt),
      decision: 'declined',
    });
  } catch (err) {
    console.error('[connector] decline notification failed:', err);
  }

  revalidatePath(`/connector/participants/${auth.ctx.participantId}`);
  revalidatePath('/journey');
  return { ok: true };
}
