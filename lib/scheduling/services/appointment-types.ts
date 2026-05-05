// REUSABLE CORE
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateAppointmentTypeInput,
  UpdateAppointmentTypeInput,
  ServiceResult,
  SchedulingAppointmentType,
} from '../types';
import { validateCreateAppointmentType } from '../validators';

export async function listAppointmentTypes(
  supabase: SupabaseClient,
  includeInactive = false
): Promise<ServiceResult<SchedulingAppointmentType[]>> {
  let query = supabase
    .from('scheduling_appointment_types')
    .select('*')
    .order('name');

  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as SchedulingAppointmentType[] };
}

export async function getAppointmentType(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<SchedulingAppointmentType>> {
  const { data, error } = await supabase
    .from('scheduling_appointment_types')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Appointment type not found', code: 'NOT_FOUND' };
  return { success: true, data: data as SchedulingAppointmentType };
}

export async function createAppointmentType(
  supabase: SupabaseClient,
  input: CreateAppointmentTypeInput
): Promise<ServiceResult<SchedulingAppointmentType>> {
  const errors = validateCreateAppointmentType(input);
  if (errors.length) return { success: false, error: errors.join('; ') };

  const { data, error } = await supabase
    .from('scheduling_appointment_types')
    .insert({
      name: input.name,
      slug: input.slug ?? null,
      description: input.description ?? null,
      duration_minutes: input.duration_minutes,
      buffer_before_minutes: input.buffer_before_minutes ?? 0,
      buffer_after_minutes: input.buffer_after_minutes ?? 0,
      min_notice_hours: input.min_notice_hours ?? 24,
      max_advance_days: input.max_advance_days ?? 90,
      cancellation_cutoff_hours: input.cancellation_cutoff_hours ?? 24,
      max_attendees: input.max_attendees ?? 1,
      requires_confirmation: input.requires_confirmation ?? false,
      location_mode: input.location_mode ?? 'in_person',
      is_public: input.is_public ?? true,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SchedulingAppointmentType };
}

export async function updateAppointmentType(
  supabase: SupabaseClient,
  id: string,
  input: UpdateAppointmentTypeInput
): Promise<ServiceResult<SchedulingAppointmentType>> {
  const { data, error } = await supabase
    .from('scheduling_appointment_types')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Appointment type not found', code: 'NOT_FOUND' };
  return { success: true, data: data as SchedulingAppointmentType };
}
