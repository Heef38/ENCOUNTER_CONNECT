// ============================================================
// SCHEDULING CORE — Booking Service
// REUSABLE CORE — accepts a Supabase client, no app-specific imports.
// ============================================================

import { addMinutes, parseISO } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateBookingInput,
  RescheduleBookingInput,
  CreateOutcomeInput,
  ServiceResult,
  SchedulingBooking,
  BookingWithRelations,
  ListBookingsFilter,
} from '../types';
import { validateCreateBooking } from '../validators';
import { queryBookings, queryBookingById } from '../queries/bookings';
import { hasConflict, isWithinBookingWindow, type BookingConflictRecord } from '../slot-engine';

// ─────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────

export async function listBookings(
  supabase: SupabaseClient,
  filter: ListBookingsFilter = {}
): Promise<ServiceResult<SchedulingBooking[]>> {
  const { data, error } = await queryBookings(supabase, filter);
  if (error) return { success: false, error: String(error) };
  return { success: true, data: (data ?? []) as SchedulingBooking[] };
}

// ─────────────────────────────────────────────
// GET BY ID
// ─────────────────────────────────────────────

export async function getBooking(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<BookingWithRelations>> {
  const { data, error } = await queryBookingById(supabase, id);
  if (error) return { success: false, error: String(error) };
  if (!data)  return { success: false, error: 'Booking not found', code: 'NOT_FOUND' };
  return { success: true, data };
}

// ─────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────

export async function createBooking(
  supabase: SupabaseClient,
  input: CreateBookingInput
): Promise<ServiceResult<SchedulingBooking>> {
  const errors = validateCreateBooking(input);
  if (errors.length) return { success: false, error: errors.join('; ') };

  // Load appointment type for duration + window rules
  const { data: apptType, error: atErr } = await supabase
    .from('scheduling_appointment_types')
    .select('*')
    .eq('id', input.appointment_type_id)
    .single();

  if (atErr || !apptType) {
    return { success: false, error: 'Appointment type not found', code: 'NOT_FOUND' };
  }

  const startsAt = parseISO(input.starts_at);
  const endsAt   = addMinutes(startsAt, apptType.duration_minutes);

  // Booking window check
  const windowCheck = isWithinBookingWindow({
    proposedStart: startsAt,
    now: new Date(),
    appointmentType: apptType,
  });
  if (!windowCheck.valid) {
    return { success: false, error: windowCheck.reason ?? 'Outside booking window' };
  }

  // Conflict check (if a resource is assigned)
  if (input.resource_id) {
    const { data: resource } = await supabase
      .from('scheduling_resources')
      .select('default_capacity')
      .eq('id', input.resource_id)
      .single();

    const { data: existingBookings } = await supabase
      .from('scheduling_bookings')
      .select('id, resource_id, starts_at, ends_at, status')
      .eq('resource_id', input.resource_id)
      .not('status', 'in', '("cancelled","rescheduled","no_show")')
      .gte('ends_at', startsAt.toISOString())
      .lte('starts_at', endsAt.toISOString());

    const bufferStart = addMinutes(startsAt, -(apptType.buffer_before_minutes ?? 0));
    const bufferEnd   = addMinutes(endsAt, apptType.buffer_after_minutes ?? 0);

    if (
      hasConflict({
        proposedStart: bufferStart,
        proposedEnd: bufferEnd,
        resourceId: input.resource_id,
        existingBookings: (existingBookings ?? []) as BookingConflictRecord[],
        capacity: resource?.default_capacity ?? 1,
      })
    ) {
      return { success: false, error: 'Time slot is no longer available', code: 'CONFLICT' };
    }
  }

  // Insert booking
  const { data: booking, error: insertErr } = await supabase
    .from('scheduling_bookings')
    .insert({
      appointment_type_id: input.appointment_type_id,
      resource_id: input.resource_id ?? null,
      location_id: input.location_id ?? null,
      title: input.title ?? apptType.name,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      timezone: input.timezone ?? 'America/Chicago',
      status: apptType.requires_confirmation ? 'pending_confirmation' : 'confirmed',
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (insertErr || !booking) {
    return { success: false, error: insertErr?.message ?? 'Failed to create booking' };
  }

  // Insert attendees
  if (input.attendees?.length) {
    const attendeeRows = input.attendees.map((a) => ({
      booking_id: booking.id,
      user_id: a.user_id ?? null,
      role: a.role ?? 'primary',
      display_name: a.display_name,
      email: a.email ?? null,
      phone: a.phone ?? null,
      notes: a.notes ?? null,
      metadata: a.metadata ?? {},
    }));
    await supabase.from('scheduling_booking_attendees').insert(attendeeRows);
  }

  // Insert external refs
  if (input.external_refs?.length) {
    const refRows = input.external_refs.map((r) => ({
      booking_id: booking.id,
      external_type: r.external_type,
      external_id: r.external_id,
      relation_kind: r.relation_kind ?? 'primary_subject',
      metadata: r.metadata ?? {},
    }));
    await supabase.from('scheduling_external_refs').insert(refRows);
  }

  // Create default reminder (24h before)
  const scheduledFor = addMinutes(startsAt, -1440);
  if (scheduledFor > new Date()) {
    await supabase.from('scheduling_reminders').insert({
      booking_id: booking.id,
      channel: 'email',
      offset_minutes: 1440,
      scheduled_for: scheduledFor.toISOString(),
      status: 'pending',
    });
  }

  return { success: true, data: booking as SchedulingBooking };
}

// ─────────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────────

export async function cancelBooking(
  supabase: SupabaseClient,
  bookingId: string,
  reason?: string
): Promise<ServiceResult<SchedulingBooking>> {
  const { data: existing } = await supabase
    .from('scheduling_bookings')
    .select('status, starts_at, appointment_type_id')
    .eq('id', bookingId)
    .single();

  if (!existing) return { success: false, error: 'Booking not found', code: 'NOT_FOUND' };
  if (['cancelled', 'completed', 'rescheduled'].includes(existing.status)) {
    return { success: false, error: `Cannot cancel a booking in ${existing.status} status` };
  }

  // Check cancellation cutoff
  const { data: apptType } = await supabase
    .from('scheduling_appointment_types')
    .select('cancellation_cutoff_hours')
    .eq('id', existing.appointment_type_id)
    .single();

  if (apptType?.cancellation_cutoff_hours) {
    const cutoff = addMinutes(parseISO(existing.starts_at), -(apptType.cancellation_cutoff_hours * 60));
    if (new Date() > cutoff) {
      return {
        success: false,
        error: `Cancellation cutoff has passed (${apptType.cancellation_cutoff_hours}h before appointment)`,
        code: 'CUTOFF_PASSED',
      };
    }
  }

  const { data, error } = await supabase
    .from('scheduling_bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: reason ?? null,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Cancel pending reminders
  await supabase
    .from('scheduling_reminders')
    .update({ status: 'cancelled' })
    .eq('booking_id', bookingId)
    .eq('status', 'pending');

  return { success: true, data: data as SchedulingBooking };
}

// ─────────────────────────────────────────────
// RESCHEDULE
// ─────────────────────────────────────────────

export async function rescheduleBooking(
  supabase: SupabaseClient,
  input: RescheduleBookingInput
): Promise<ServiceResult<SchedulingBooking>> {
  const { booking_id, starts_at, notes } = input;

  const { data: existing } = await supabase
    .from('scheduling_bookings')
    .select('*, appointment_type:scheduling_appointment_types(*)')
    .eq('id', booking_id)
    .single();

  if (!existing) return { success: false, error: 'Booking not found', code: 'NOT_FOUND' };
  if (['cancelled', 'completed'].includes(existing.status)) {
    return { success: false, error: `Cannot reschedule a ${existing.status} booking` };
  }

  const apptType = existing.appointment_type;
  const newStart = parseISO(starts_at);
  const newEnd   = addMinutes(newStart, apptType.duration_minutes);

  // Window check
  const windowCheck = isWithinBookingWindow({
    proposedStart: newStart,
    now: new Date(),
    appointmentType: apptType,
  });
  if (!windowCheck.valid) {
    return { success: false, error: windowCheck.reason ?? 'Outside booking window' };
  }

  // Conflict check
  if (existing.resource_id) {
    const { data: resource } = await supabase
      .from('scheduling_resources')
      .select('default_capacity')
      .eq('id', existing.resource_id)
      .single();

    const { data: existingBookings } = await supabase
      .from('scheduling_bookings')
      .select('id, resource_id, starts_at, ends_at, status')
      .eq('resource_id', existing.resource_id)
      .not('status', 'in', '("cancelled","rescheduled","no_show")')
      .gte('ends_at', newStart.toISOString())
      .lte('starts_at', newEnd.toISOString());

    if (
      hasConflict({
        proposedStart: newStart,
        proposedEnd: newEnd,
        resourceId: existing.resource_id,
        excludeBookingId: booking_id,
        existingBookings: (existingBookings ?? []) as BookingConflictRecord[],
        capacity: resource?.default_capacity ?? 1,
      })
    ) {
      return { success: false, error: 'New time slot is not available', code: 'CONFLICT' };
    }
  }

  // Mark old booking as rescheduled, create new one
  await supabase
    .from('scheduling_bookings')
    .update({ status: 'rescheduled' })
    .eq('id', booking_id);

  const createResult = await createBooking(supabase, {
    appointment_type_id: existing.appointment_type_id,
    resource_id: existing.resource_id ?? undefined,
    location_id: existing.location_id ?? undefined,
    title: existing.title ?? undefined,
    starts_at: starts_at,
    timezone: existing.timezone,
    notes: notes ?? existing.notes ?? undefined,
    metadata: { rescheduled_from: booking_id, ...existing.metadata },
  });

  return createResult;
}

// ─────────────────────────────────────────────
// CONFIRM
// ─────────────────────────────────────────────

export async function confirmBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<ServiceResult<SchedulingBooking>> {
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('status', 'pending_confirmation')
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Booking not found or already confirmed', code: 'NOT_FOUND' };
  return { success: true, data: data as SchedulingBooking };
}

// ─────────────────────────────────────────────
// COMPLETE
// ─────────────────────────────────────────────

export async function completeBooking(
  supabase: SupabaseClient,
  bookingId: string,
  outcome?: CreateOutcomeInput
): Promise<ServiceResult<SchedulingBooking>> {
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .in('status', ['confirmed', 'pending_confirmation'])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Booking not found or not completable', code: 'NOT_FOUND' };

  if (outcome) {
    await supabase.from('scheduling_outcomes').insert({
      booking_id: bookingId,
      kind: outcome.kind,
      summary: outcome.summary ?? null,
      next_action: outcome.next_action ?? null,
      followup_booking_id: outcome.followup_booking_id ?? null,
      metadata: outcome.metadata ?? {},
    });
  }

  return { success: true, data: data as SchedulingBooking };
}

// ─────────────────────────────────────────────
// MARK NO-SHOW
// ─────────────────────────────────────────────

export async function markNoShow(
  supabase: SupabaseClient,
  bookingId: string
): Promise<ServiceResult<SchedulingBooking>> {
  const { data, error } = await supabase
    .from('scheduling_bookings')
    .update({ status: 'no_show' })
    .eq('id', bookingId)
    .in('status', ['confirmed', 'pending_confirmation'])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Booking not found', code: 'NOT_FOUND' };
  return { success: true, data: data as SchedulingBooking };
}
