'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth, requireCampusAdmin, requireStaff } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { ServiceResult } from '@/lib/events/types';

const KINDS = ['call', 'text', 'email', 'in_person', 'note'] as const;
type ManualKind = (typeof KINDS)[number];

/**
 * "I reached out." One tap for the personal call, text or coffee that the
 * app can't see. Meetings and messages the app sends log themselves.
 * RLS (migration 034): the church's connectors and admins only.
 */
export async function logContact(
  participantId: string,
  kind: ManualKind,
  summary?: string,
  occurredOn?: string,
): Promise<ServiceResult<null>> {
  const session = await requireStaff();
  if (!KINDS.includes(kind)) return { success: false, error: 'Pick how you reached out.' };
  const note = summary?.trim().slice(0, 2000) || null;
  // A past day can be logged ("I called on Sunday"); never a future one.
  let occurred = new Date();
  if (occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    const d = new Date(`${occurredOn}T12:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 36e5) occurred = d;
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('participant_touches').insert({
    participant_id: participantId,
    church_id: session.profile?.church_id,
    kind,
    source: 'manual',
    summary: note,
    occurred_at: occurred.toISOString(),
    created_by_profile_id: session.id,
  });
  if (error) {
    return {
      success: false,
      error: error.message.startsWith('new row violates') ? 'Only your church’s connectors and admins can log contacts.' : error.message,
    };
  }

  await recordAudit({ action: 'participant.contact_logged', entity_type: 'participant', entity_id: participantId, metadata: { kind } });
  revalidatePath(`/participants/${participantId}`);
  revalidatePath(`/connector/participants/${participantId}`);
  revalidatePath('/dashboard');
  return { success: true, data: null };
}

export async function deleteContact(touchId: string, participantId: string): Promise<ServiceResult<null>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('participant_touches').delete().eq('id', touchId).select('id');
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Only the person who logged it or an admin can remove it.' };
  revalidatePath(`/participants/${participantId}`);
  revalidatePath(`/connector/participants/${participantId}`);
  return { success: true, data: null };
}

/**
 * Trusted host: lets someone host without the journey gate, for churches
 * whose onboarding is a handshake. The database only accepts it from a
 * campus admin or church admin of the person's church, never from the
 * person (migration 031).
 */
export async function setTrustedHost(profileId: string, trusted: boolean): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ trusted_host_at: trusted ? new Date().toISOString() : null, trusted_host_by: trusted ? session.id : null })
    .eq('id', profileId)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Only an admin of their church can do that.' };
  await recordAudit({ action: trusted ? 'profile.trusted_host' : 'profile.trusted_host_removed', entity_type: 'profile', entity_id: profileId });
  revalidatePath('/participants');
  return { success: true, data: null };
}

export async function setHostBlocked(profileId: string, blocked: boolean): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({ host_blocked_at: blocked ? new Date().toISOString() : null, host_blocked_by: blocked ? session.id : null })
    .eq('id', profileId)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Only an admin of their church can do that.' };
  await recordAudit({ action: blocked ? 'profile.host_blocked' : 'profile.host_unblocked', entity_type: 'profile', entity_id: profileId });
  return { success: true, data: null };
}

/** Admin's quick action from the console: put someone at a table. */
export async function introduceToGroup(participantId: string, groupId: string): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const admin = await createServiceRoleClient();
  const { data: p } = await admin.from('participants').select('profile_id, church_id').eq('id', participantId).maybeSingle();
  if (!p?.profile_id) return { success: false, error: 'They need an account before joining a group.' };
  if (!session.profile?.is_platform_admin && p.church_id !== session.profile?.church_id) {
    return { success: false, error: 'They belong to another church.' };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: groupId, profile_id: p.profile_id, role: 'member', added_by_profile_id: session.id }, { onConflict: 'group_id,profile_id', ignoreDuplicates: true });
  if (error) return { success: false, error: error.message };
  await recordAudit({ action: 'group.member_add', entity_type: 'group', entity_id: groupId, metadata: { participant_id: participantId, via: 'introduce' } });
  revalidatePath('/dashboard');
  revalidatePath(`/participants/${participantId}`);
  return { success: true, data: null };
}
