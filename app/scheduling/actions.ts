'use server';
// APP-SPECIFIC: Server actions bridge the UI to the service layer.
// These are not part of the reusable core.
//
// Every action checks the caller first (lib/scheduling-api/action-guard.ts):
// a church, campus or platform admin, touching their own church's rows.
// They run on the service role, and the proxy does not cover server actions.

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  requireSchedulingAdmin,
  isDenied,
  denied,
  ownsResource,
  ownsLocation,
  ownsAppointmentType,
  ownsBooking,
  ownsResourceChild,
} from '@/lib/scheduling-api/action-guard';
import {
  createBooking,
  cancelBooking,
  confirmBooking,
  completeBooking,
  rescheduleBooking,
  markNoShow,
} from '@/lib/scheduling/services/bookings';
import {
  createResource,
  updateResource,
  createAvailabilityRule,
  deleteAvailabilityRule,
  createBlackout,
  deleteBlackout,
} from '@/lib/scheduling/services/resources';
import {
  createAppointmentType,
  updateAppointmentType,
} from '@/lib/scheduling/services/appointment-types';
import type {
  CreateBookingInput,
  CreateResourceInput,
  UpdateResourceInput,
  CreateAvailabilityRuleInput,
  CreateBlackoutInput,
  CreateAppointmentTypeInput,
  UpdateAppointmentTypeInput,
  CreateOutcomeInput,
  RescheduleBookingInput,
} from '@/lib/scheduling/types';

// ─────────────────────────────────────────────
// BOOKING ACTIONS
// ─────────────────────────────────────────────

export async function actionCreateBooking(input: CreateBookingInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsAppointmentType(g, supabase, input.appointment_type_id))) return denied();
  if (input.resource_id && !(await ownsResource(g, input.resource_id))) return denied();
  if (input.location_id && !(await ownsLocation(g, input.location_id))) return denied();
  const result = await createBooking(supabase, input);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionCancelBooking(bookingId: string, reason?: string) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsBooking(g, supabase, bookingId))) return denied();
  const result = await cancelBooking(supabase, bookingId, reason);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionConfirmBooking(bookingId: string) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsBooking(g, supabase, bookingId))) return denied();
  const result = await confirmBooking(supabase, bookingId);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionCompleteBooking(bookingId: string, outcome?: CreateOutcomeInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsBooking(g, supabase, bookingId))) return denied();
  const result = await completeBooking(supabase, bookingId, outcome);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionRescheduleBooking(input: RescheduleBookingInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsBooking(g, supabase, input.booking_id))) return denied();
  const result = await rescheduleBooking(supabase, input);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionMarkNoShow(bookingId: string) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsBooking(g, supabase, bookingId))) return denied();
  const result = await markNoShow(supabase, bookingId);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

// ─────────────────────────────────────────────
// RESOURCE ACTIONS
// ─────────────────────────────────────────────

export async function actionCreateResource(input: CreateResourceInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  if (input.location_id && !(await ownsLocation(g, input.location_id))) return denied();
  const supabase = await createServiceRoleClient();
  const result = await createResource(supabase, input);
  if (result.success) revalidatePath('/scheduling/resources');
  return result;
}

export async function actionUpdateResource(id: string, input: UpdateResourceInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  if (!(await ownsResource(g, id))) return denied();
  if (input.location_id && !(await ownsLocation(g, input.location_id))) return denied();
  const supabase = await createServiceRoleClient();
  const result = await updateResource(supabase, id, input);
  if (result.success) revalidatePath('/scheduling/resources');
  return result;
}

export async function actionCreateAvailabilityRule(input: CreateAvailabilityRuleInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsResource(g, input.resource_id))) return denied();
  if (input.appointment_type_id && !(await ownsAppointmentType(g, supabase, input.appointment_type_id))) {
    return denied();
  }
  const result = await createAvailabilityRule(supabase, input);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionDeleteAvailabilityRule(id: string) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsResourceChild(g, supabase, 'scheduling_availability_rules', id))) return denied();
  const result = await deleteAvailabilityRule(supabase, id);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionCreateBlackout(input: CreateBlackoutInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  // A blackout with neither a calendar nor a room blocks every church.
  if (!input.resource_id && !input.location_id && !g.isPlatform) return denied();
  if (input.resource_id && !(await ownsResource(g, input.resource_id))) return denied();
  if (input.location_id && !(await ownsLocation(g, input.location_id))) return denied();
  const supabase = await createServiceRoleClient();
  const result = await createBlackout(supabase, input);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionDeleteBlackout(id: string) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsResourceChild(g, supabase, 'scheduling_blackouts', id))) return denied();
  const result = await deleteBlackout(supabase, id);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

// ─────────────────────────────────────────────
// APPOINTMENT TYPE ACTIONS
// ─────────────────────────────────────────────

export async function actionCreateAppointmentType(input: CreateAppointmentTypeInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  const result = await createAppointmentType(supabase, input);
  // The core doesn't know about churches (020); the new type is the caller's.
  if (result.success && g.churchId) {
    await supabase.from('scheduling_appointment_types').update({ church_id: g.churchId }).eq('id', result.data.id);
  }
  if (result.success) revalidatePath('/scheduling/appointment-types');
  return result;
}

export async function actionUpdateAppointmentType(id: string, input: UpdateAppointmentTypeInput) {
  const g = await requireSchedulingAdmin();
  if (isDenied(g)) return g;
  const supabase = await createServiceRoleClient();
  if (!(await ownsAppointmentType(g, supabase, id))) return denied();
  const result = await updateAppointmentType(supabase, id, input);
  if (result.success) revalidatePath('/scheduling/appointment-types');
  return result;
}
