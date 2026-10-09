'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { ServiceResult } from '@/lib/events/types';

/**
 * Membership is an admin's call (migration 035 guards these columns).
 * Each write goes through the admin's own client, so RLS and the guard
 * both apply, and a refused write reports as refused.
 */

async function writeMembership(
  participantId: string,
  fields: Record<string, unknown>,
  action: string,
): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('participants')
    .update(fields)
    .eq('id', participantId)
    .select('id');
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: 'Only an admin of this church can do that.' };
  await recordAudit({ action, entity_type: 'participant', entity_id: participantId, metadata: { by: session.id } });
  revalidatePath(`/participants/${participantId}`);
  revalidatePath('/dashboard');
  revalidatePath('/participants');
  return { success: true, data: null };
}

/** "Yes, they belong here." Gives a member standing (status connected). */
export async function confirmMember(participantId: string): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  return writeMembership(
    participantId,
    { joined_as: 'member', member_confirmed_at: new Date().toISOString(), member_confirmed_by: session.id, status: 'connected' },
    'participant.member_confirmed',
  );
}

/** "They're actually new": back into the newcomer pipeline. */
export async function welcomeAsNew(participantId: string): Promise<ServiceResult<null>> {
  return writeMembership(
    participantId,
    { joined_as: 'guest', member_confirmed_at: null, member_confirmed_by: null },
    'participant.welcomed_as_new',
  );
}
