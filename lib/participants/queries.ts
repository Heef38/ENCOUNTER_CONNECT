import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListParticipantsFilter } from './types';

export function queryParticipants(
  supabase: SupabaseClient,
  filter: ListParticipantsFilter = {},
) {
  let q = supabase
    .from('participants')
    .select(
      `*,
       campus:campuses(id, name),
       connector:connectors(
         id,
         profile:profiles(first_name, last_name, email)
       )`,
    )
    .order('created_at', { ascending: false });

  if (filter.campus_id) q = q.eq('campus_id', filter.campus_id);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.connector_id) q = q.eq('assigned_connector_id', filter.connector_id);
  if (filter.search) {
    q = q.or(
      `first_name.ilike.%${filter.search}%,last_name.ilike.%${filter.search}%,email.ilike.%${filter.search}%`,
    );
  }
  if (filter.limit) q = q.limit(filter.limit);
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit ?? 20) - 1);

  return q;
}

export function queryParticipantById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('participants')
    .select(
      `*,
       campus:campuses(id, name),
       connector:connectors(
         id,
         profile:profiles(first_name, last_name, email)
       ),
       progress:participant_progress(
         *,
         flow_step:flow_steps(id, title, step_type, order_index, is_required)
       )`,
    )
    .eq('id', id)
    .order('order_index', { referencedTable: 'participant_progress.flow_steps' })
    .single();
}

export function queryParticipantProgress(
  supabase: SupabaseClient,
  participantId: string,
) {
  return supabase
    .from('participant_progress')
    .select(
      `*,
       flow_step:flow_steps(id, title, step_type, order_index, is_required)`,
    )
    .eq('participant_id', participantId)
    .order('order_index', { referencedTable: 'flow_steps' });
}
