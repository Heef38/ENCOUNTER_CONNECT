// REUSABLE CORE
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateResourceInput,
  UpdateResourceInput,
  ServiceResult,
  SchedulingResource,
  ResourceWithAvailability,
  ListResourcesFilter,
  CreateAvailabilityRuleInput,
  SchedulingAvailabilityRule,
  CreateBlackoutInput,
  SchedulingBlackout,
} from '../types';
import {
  validateCreateResource,
  validateAvailabilityRule,
} from '../validators';
import {
  queryResources,
  queryResourceById,
} from '../queries/resources';

// ─────────────────────────────────────────────
// RESOURCES
// ─────────────────────────────────────────────

export async function listResources(
  supabase: SupabaseClient,
  filter: ListResourcesFilter = {}
): Promise<ServiceResult<SchedulingResource[]>> {
  const { data, error } = await queryResources(supabase, filter);
  if (error) return { success: false, error: String(error) };
  return { success: true, data: (data ?? []) as SchedulingResource[] };
}

export async function getResource(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<ResourceWithAvailability>> {
  const { data, error } = await queryResourceById(supabase, id);
  if (error) return { success: false, error: String(error) };
  if (!data)  return { success: false, error: 'Resource not found', code: 'NOT_FOUND' };
  return { success: true, data: data as unknown as ResourceWithAvailability };
}

export async function createResource(
  supabase: SupabaseClient,
  input: CreateResourceInput
): Promise<ServiceResult<SchedulingResource>> {
  const errors = validateCreateResource(input);
  if (errors.length) return { success: false, error: errors.join('; ') };

  const { data, error } = await supabase
    .from('scheduling_resources')
    .insert({
      name: input.name,
      kind: input.kind ?? 'person',
      description: input.description ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      timezone: input.timezone ?? 'America/Chicago',
      location_id: input.location_id ?? null,
      group_id: input.group_id ?? null,
      user_id: input.user_id ?? null,
      default_capacity: input.default_capacity ?? 1,
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SchedulingResource };
}

export async function updateResource(
  supabase: SupabaseClient,
  id: string,
  input: UpdateResourceInput
): Promise<ServiceResult<SchedulingResource>> {
  const { data, error } = await supabase
    .from('scheduling_resources')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: 'Resource not found', code: 'NOT_FOUND' };
  return { success: true, data: data as SchedulingResource };
}

export async function deactivateResource(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<SchedulingResource>> {
  return updateResource(supabase, id, { is_active: false });
}

// ─────────────────────────────────────────────
// AVAILABILITY RULES
// ─────────────────────────────────────────────

export async function createAvailabilityRule(
  supabase: SupabaseClient,
  input: CreateAvailabilityRuleInput
): Promise<ServiceResult<SchedulingAvailabilityRule>> {
  const errors = validateAvailabilityRule(input);
  if (errors.length) return { success: false, error: errors.join('; ') };

  const ruleType = input.rule_type ?? 'recurring';
  const { data, error } = await supabase
    .from('scheduling_availability_rules')
    .insert({
      resource_id: input.resource_id,
      appointment_type_id: input.appointment_type_id ?? null,
      rule_type: ruleType,
      day_of_week: ruleType === 'recurring' ? (input.day_of_week ?? 1) : null,
      start_time: input.start_time,
      end_time: input.end_time,
      effective_from: input.effective_from ?? null,
      effective_until: input.effective_until ?? null,
      timezone: input.timezone ?? 'America/Chicago',
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SchedulingAvailabilityRule };
}

export async function deleteAvailabilityRule(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<void>> {
  const { error } = await supabase
    .from('scheduling_availability_rules')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────
// BLACKOUTS
// ─────────────────────────────────────────────

export async function createBlackout(
  supabase: SupabaseClient,
  input: CreateBlackoutInput
): Promise<ServiceResult<SchedulingBlackout>> {
  if (!input.title)     return { success: false, error: 'title is required' };
  if (!input.starts_at) return { success: false, error: 'starts_at is required' };
  if (!input.ends_at)   return { success: false, error: 'ends_at is required' };
  if (input.starts_at >= input.ends_at) {
    return { success: false, error: 'ends_at must be after starts_at' };
  }

  const { data, error } = await supabase
    .from('scheduling_blackouts')
    .insert({
      scope: input.scope ?? 'resource',
      resource_id: input.resource_id ?? null,
      location_id: input.location_id ?? null,
      title: input.title,
      reason: input.reason ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as SchedulingBlackout };
}

export async function deleteBlackout(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<void>> {
  const { error } = await supabase
    .from('scheduling_blackouts')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}
