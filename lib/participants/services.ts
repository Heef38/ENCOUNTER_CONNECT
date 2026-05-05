import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult } from '@/lib/scheduling/types';
import type {
  Participant,
  ParticipantWithRelations,
  ParticipantProgress,
  CreateParticipantInput,
  UpdateParticipantInput,
  UpdateProgressInput,
  ListParticipantsFilter,
} from './types';
import { queryParticipants, queryParticipantById } from './queries';

// ── Participants ──────────────────────────────────────────────

export async function listParticipants(
  supabase: SupabaseClient,
  filter: ListParticipantsFilter = {},
): Promise<ServiceResult<Participant[]>> {
  const { data, error } = await queryParticipants(supabase, filter);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as unknown as Participant[] };
}

export async function getParticipant(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<ParticipantWithRelations>> {
  const { data, error } = await queryParticipantById(supabase, id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as unknown as ParticipantWithRelations };
}

export async function createParticipant(
  supabase: SupabaseClient,
  input: CreateParticipantInput,
): Promise<ServiceResult<Participant>> {
  if (!input.first_name?.trim() || !input.last_name?.trim()) {
    return { success: false, error: 'First and last name are required.' };
  }

  let churchId = input.church_id ?? null;
  if (!churchId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };
    const { data: profile } = await supabase
      .from('profiles')
      .select('church_id')
      .eq('id', user.id)
      .maybeSingle();
    churchId = (profile as { church_id: string | null } | null)?.church_id ?? null;
  }
  if (!churchId) {
    return {
      success: false,
      error: 'No church associated with your account. Specify church_id explicitly.',
    };
  }

  const { data, error } = await supabase
    .from('participants')
    .insert({
      church_id: churchId,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email: input.email ?? null,
      phone: input.phone ?? null,
      campus_id: input.campus_id ?? null,
      assigned_connector_id: input.assigned_connector_id ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Participant };
}

export async function updateParticipant(
  supabase: SupabaseClient,
  id: string,
  input: UpdateParticipantInput,
): Promise<ServiceResult<Participant>> {
  const { data, error } = await supabase
    .from('participants')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Participant };
}

export async function assignConnector(
  supabase: SupabaseClient,
  participantId: string,
  connectorId: string | null,
): Promise<ServiceResult<Participant>> {
  const { data, error } = await supabase
    .from('participants')
    .update({ assigned_connector_id: connectorId, status: 'connected' })
    .eq('id', participantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Participant };
}

// ── Progress ──────────────────────────────────────────────────

export async function updateProgress(
  supabase: SupabaseClient,
  participantId: string,
  flowStepId: string,
  input: UpdateProgressInput,
): Promise<ServiceResult<ParticipantProgress>> {
  const patch: Record<string, unknown> = {
    status: input.status,
    notes: input.notes ?? null,
  };
  if (input.scheduled_event_id) patch.scheduled_event_id = input.scheduled_event_id;
  if (input.status === 'completed' && !input.completed_at) {
    patch.completed_at = new Date().toISOString();
  } else if (input.completed_at) {
    patch.completed_at = input.completed_at;
  }

  const { data, error } = await supabase
    .from('participant_progress')
    .upsert(
      { participant_id: participantId, flow_step_id: flowStepId, ...patch },
      { onConflict: 'participant_id,flow_step_id' },
    )
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: data as ParticipantProgress };
}
