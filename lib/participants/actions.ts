'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireCampusAdmin, requireChurchAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Permanently deletes a participant: their participants row (cascades
 * progress, assessments, connector links) and their auth user (cascades
 * the profile). Church-admin+ only, scoped to their church. Irreversible.
 */
export async function deleteParticipantAccount(participantId: string): Promise<ActionResult> {
  const session = await requireChurchAdmin();
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const admin = await createServiceRoleClient();

  const { data: participant } = await admin
    .from('participants')
    .select('id, church_id, profile_id')
    .eq('id', participantId)
    .maybeSingle();
  if (!participant) return { ok: false, error: 'Participant not found.' };

  // Tenant safety: a church admin may only delete their own church's people.
  if (!isPlatform && participant.church_id !== session.profile?.church_id) {
    return { ok: false, error: 'Not authorized for this participant.' };
  }

  const { error: delErr } = await admin.from('participants').delete().eq('id', participantId);
  if (delErr) return { ok: false, error: delErr.message };

  // Remove the auth user (cascades the profile). Best-effort — the
  // participant record is already gone; a leftover auth user is recoverable.
  const profileId = participant.profile_id as string | null;
  if (profileId) {
    try {
      await admin.auth.admin.deleteUser(profileId);
    } catch (err) {
      console.error('[participants] auth user delete failed:', err);
    }
  }

  await recordAudit({
    action: 'participant.deleted',
    entity_type: 'participant',
    entity_id: participantId,
    metadata: { church_id: participant.church_id },
  });

  revalidatePath('/participants');
  revalidatePath('/people');
  // The participant (and possibly the page we're on) is gone — go to People.
  redirect('/people');
}

/**
 * Assign/reassign a participant's church and/or campus. Campus changes are
 * available to campus_admin+ within their church; moving a participant to a
 * different church is platform-admin only. `campusId` of '' / null clears the
 * campus. The campus must belong to the resulting church.
 */
export async function reassignParticipant(
  participantId: string,
  churchId: string | null,
  campusId: string | null,
): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const supabase = await createServerSupabaseClient();

  const { data: participant } = await supabase
    .from('participants')
    .select('id, church_id, campus_id')
    .eq('id', participantId)
    .maybeSingle();
  if (!participant) return { ok: false, error: 'Participant not found.' };

  let nextChurch = participant.church_id as string;
  let nextCampus = campusId && campusId !== '' ? campusId : null;

  if (churchId && churchId !== participant.church_id) {
    if (!isPlatform) {
      return { ok: false, error: 'Only platform admins can move a participant to another church.' };
    }
    nextChurch = churchId;
  }

  if (nextCampus) {
    const { data: campus } = await supabase
      .from('campuses')
      .select('id, church_id')
      .eq('id', nextCampus)
      .maybeSingle();
    if (!campus || campus.church_id !== nextChurch) {
      return { ok: false, error: 'That campus does not belong to the selected church.' };
    }
  }

  const { error } = await supabase
    .from('participants')
    .update({ church_id: nextChurch, campus_id: nextCampus })
    .eq('id', participantId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'participant.reassigned',
    entity_type: 'participant',
    entity_id: participantId,
    metadata: { church_id: nextChurch, campus_id: nextCampus },
  });

  revalidatePath(`/participants/${participantId}`);
  return { ok: true };
}
