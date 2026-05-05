import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListConnectorsFilter } from './types';

export function queryConnectors(
  supabase: SupabaseClient,
  filter: ListConnectorsFilter = {},
) {
  let q = supabase
    .from('connectors')
    .select(
      `*,
       profile:profiles(first_name, last_name, email),
       campus:campuses(id, name)`,
    )
    .order('created_at', { ascending: false });

  if (filter.campus_id) q = q.eq('campus_id', filter.campus_id);
  if (filter.is_active !== undefined) q = q.eq('is_active', filter.is_active);

  return q;
}

export function queryConnectorById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('connectors')
    .select(
      `*,
       profile:profiles(first_name, last_name, email),
       campus:campuses(id, name)`,
    )
    .eq('id', id)
    .single();
}
