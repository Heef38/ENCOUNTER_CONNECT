'use server';
// APP-SPECIFIC: Server actions bridge the UI to the service layer.
// These are not part of the reusable core.

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
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
  const supabase = await createServiceRoleClient();
  const result = await createBooking(supabase, input);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionCancelBooking(bookingId: string, reason?: string) {
  const supabase = await createServiceRoleClient();
  const result = await cancelBooking(supabase, bookingId, reason);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionConfirmBooking(bookingId: string) {
  const supabase = await createServiceRoleClient();
  const result = await confirmBooking(supabase, bookingId);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionCompleteBooking(bookingId: string, outcome?: CreateOutcomeInput) {
  const supabase = await createServiceRoleClient();
  const result = await completeBooking(supabase, bookingId, outcome);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionRescheduleBooking(input: RescheduleBookingInput) {
  const supabase = await createServiceRoleClient();
  const result = await rescheduleBooking(supabase, input);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

export async function actionMarkNoShow(bookingId: string) {
  const supabase = await createServiceRoleClient();
  const result = await markNoShow(supabase, bookingId);
  if (result.success) revalidatePath('/scheduling/bookings');
  return result;
}

// ─────────────────────────────────────────────
// RESOURCE ACTIONS
// ─────────────────────────────────────────────

export async function actionCreateResource(input: CreateResourceInput) {
  const supabase = await createServiceRoleClient();
  const result = await createResource(supabase, input);
  if (result.success) revalidatePath('/scheduling/resources');
  return result;
}

export async function actionUpdateResource(id: string, input: UpdateResourceInput) {
  const supabase = await createServiceRoleClient();
  const result = await updateResource(supabase, id, input);
  if (result.success) revalidatePath('/scheduling/resources');
  return result;
}

export async function actionCreateAvailabilityRule(input: CreateAvailabilityRuleInput) {
  const supabase = await createServiceRoleClient();
  const result = await createAvailabilityRule(supabase, input);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionDeleteAvailabilityRule(id: string) {
  const supabase = await createServiceRoleClient();
  const result = await deleteAvailabilityRule(supabase, id);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionCreateBlackout(input: CreateBlackoutInput) {
  const supabase = await createServiceRoleClient();
  const result = await createBlackout(supabase, input);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

export async function actionDeleteBlackout(id: string) {
  const supabase = await createServiceRoleClient();
  const result = await deleteBlackout(supabase, id);
  if (result.success) revalidatePath('/scheduling/availability');
  return result;
}

// ─────────────────────────────────────────────
// APPOINTMENT TYPE ACTIONS
// ─────────────────────────────────────────────

export async function actionCreateAppointmentType(input: CreateAppointmentTypeInput) {
  const supabase = await createServiceRoleClient();
  const result = await createAppointmentType(supabase, input);
  if (result.success) revalidatePath('/scheduling/appointment-types');
  return result;
}

export async function actionUpdateAppointmentType(id: string, input: UpdateAppointmentTypeInput) {
  const supabase = await createServiceRoleClient();
  const result = await updateAppointmentType(supabase, id, input);
  if (result.success) revalidatePath('/scheduling/appointment-types');
  return result;
}
