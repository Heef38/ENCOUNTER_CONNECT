'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

export interface ActionResult {
  ok: boolean;
  error?: string;
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
