// REUSABLE CORE
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListResourcesFilter } from '../types';

export async function queryResources(
  supabase: SupabaseClient,
  filter: ListResourcesFilter = {}
) {
  const { kind, location_id, group_id, is_active } = filter;

  let query = supabase
    .from('scheduling_resources')
    .select(`
      *,
      location:scheduling_locations(*),
      group:scheduling_resource_groups(*)
    `)
    .order('name');

  if (kind)        query = query.eq('kind', kind);
  if (location_id) query = query.eq('location_id', location_id);
  if (group_id)    query = query.eq('group_id', group_id);
  if (is_active !== undefined) query = query.eq('is_active', is_active);

  return query;
}

export async function queryResourceById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('scheduling_resources')
    .select(`
      *,
      location:scheduling_locations(*),
      group:scheduling_resource_groups(*),
      availability_rules:scheduling_availability_rules(*),
      blackouts:scheduling_blackouts(*)
    `)
    .eq('id', id)
    .single();
}

export async function queryAvailabilityRules(
  supabase: SupabaseClient,
  resource_id: string
) {
  return supabase
    .from('scheduling_availability_rules')
    .select('*')
    .eq('resource_id', resource_id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');
}

export async function queryBlackouts(
  supabase: SupabaseClient,
  resource_id: string,
  from: string,
  to: string
) {
  return supabase
    .from('scheduling_blackouts')
    .select('*')
    .eq('resource_id', resource_id)
    .eq('is_active', true)
    .lt('starts_at', to)
    .gt('ends_at', from);
}
