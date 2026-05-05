import type { SupabaseClient } from '@supabase/supabase-js';

export function queryFlows(supabase: SupabaseClient, campusId?: string) {
  let q = supabase
    .from('flows')
    .select(`*, campus:campuses(id, name)`)
    .order('is_default', { ascending: false })
    .order('name');

  if (campusId) {
    q = q.or(`campus_id.eq.${campusId},campus_id.is.null`);
  }

  return q;
}

export function queryFlowById(supabase: SupabaseClient, id: string) {
  return supabase
    .from('flows')
    .select(
      `*,
       campus:campuses(id, name),
       steps:flow_steps(
         *,
         appointment_type:scheduling_appointment_types(id, name, duration_minutes),
         lesson_links:flow_step_lessons(
           order_index,
           lesson:lessons(id, title, slug, video_url, body, order_index)
         )
       )`,
    )
    .eq('id', id)
    .order('order_index', { referencedTable: 'flow_steps' })
    .single();
}

export function queryActiveFlows(supabase: SupabaseClient) {
  return supabase
    .from('flows')
    .select('*, campus:campuses(id, name)')
    .eq('is_active', true)
    .order('name');
}
