import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { inviteTokenMatches, parseInviteCode } from './token';
import { inviteState, type InviteRow } from './types';

/**
 * Resolves an /invite/[code] link to its open invite. A wrong token, an
 * unknown id, and a replaced link all read the same, so a link cannot be
 * used to probe for invites.
 */
export async function loadOpenInvite(
  admin: SupabaseClient,
  code: string,
): Promise<{ invite: InviteRow } | { error: string; churchId?: string }> {
  const parsed = parseInviteCode(code);
  if (!parsed) return { error: 'This invite link is not valid.' };
  const { data } = await admin.from('church_invites').select('*').eq('id', parsed.inviteId).maybeSingle();
  const invite = data as InviteRow | null;
  if (!invite || !inviteTokenMatches(invite.id, invite.nonce, parsed.token)) {
    return { error: 'This invite link is not valid. If you were sent a newer one, use that instead.' };
  }
  const state = inviteState(invite);
  if (state === 'accepted') return { error: 'This invite has already been accepted. Sign in from the front page.', churchId: invite.church_id };
  if (state === 'revoked') return { error: 'This invite was withdrawn. Ask the church to send a new one.', churchId: invite.church_id };
  if (state === 'expired') return { error: 'This invite has expired. Ask the church to send a new one.', churchId: invite.church_id };
  return { invite };
}

export interface InvitePageData {
  invite: InviteRow;
  church: { name: string; connect_name: string | null; logo_url: string | null };
  campusName: string | null;
  inviterName: string | null;
  /** An account already uses this email: accept by signing in. */
  hasAccount: boolean;
  signedInEmail: string | null;
}

export async function getInvitePage(code: string): Promise<{ data: InvitePageData } | { error: string; church?: InvitePageData['church'] }> {
  const admin = await createServiceRoleClient();
  const found = await loadOpenInvite(admin, code);
  if ('error' in found) {
    if (!found.churchId) return { error: found.error };
    const { data: ch } = await admin.from('churches').select('name, connect_name, logo_url').eq('id', found.churchId).maybeSingle();
    return { error: found.error, church: (ch as InvitePageData['church'] | null) ?? undefined };
  }
  const invite = found.invite;
  const supabase = await createServerSupabaseClient();
  const [{ data: church }, { data: campus }, { data: inviter }, { data: existing }, { data: auth }] = await Promise.all([
    admin.from('churches').select('name, connect_name, logo_url').eq('id', invite.church_id).maybeSingle(),
    invite.campus_id
      ? admin.from('campuses').select('name').eq('id', invite.campus_id).maybeSingle()
      : Promise.resolve({ data: null }),
    invite.invited_by
      ? admin.from('profiles').select('first_name, last_name').eq('id', invite.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('profiles').select('id').eq('email', invite.email).limit(1),
    supabase.auth.getUser(),
  ]);
  if (!church) return { error: 'This invite link is not valid.' };
  const who = inviter as { first_name: string | null; last_name: string | null } | null;
  return {
    data: {
      invite,
      church: church as InvitePageData['church'],
      campusName: (campus as { name: string } | null)?.name ?? null,
      inviterName: who ? `${who.first_name ?? ''} ${who.last_name ?? ''}`.trim() || null : null,
      hasAccount: ((existing ?? []) as unknown[]).length > 0,
      signedInEmail: auth.user?.email?.toLowerCase() ?? null,
    },
  };
}

export interface InviteListItem {
  id: string;
  email: string;
  name: string | null;
  role: InviteRow['role'];
  campus_id: string | null;
  created_at: string;
  expires_at: string;
  last_sent_at: string | null;
  send_count: number;
  state: ReturnType<typeof inviteState>;
}

/** Invites still waiting on someone, for People (RLS: the church's admins). */
export async function listPendingInvites(churchId: string): Promise<InviteListItem[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('church_invites')
    .select('id, email, first_name, last_name, role, campus_id, created_at, expires_at, last_sent_at, send_count, accepted_at, revoked_at')
    .eq('church_id', churchId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  return ((data ?? []) as Array<InviteRow>).map((r) => ({
    id: r.id,
    email: r.email,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
    role: r.role,
    campus_id: r.campus_id,
    created_at: r.created_at,
    expires_at: r.expires_at,
    last_sent_at: r.last_sent_at,
    send_count: r.send_count,
    state: inviteState(r),
  }));
}
