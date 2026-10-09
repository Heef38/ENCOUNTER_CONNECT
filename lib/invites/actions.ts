'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession, landingForSession, requireCampusAdmin, requirePlatformAdmin, type SessionUser } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { ECUserRole, Profile } from '@/lib/church/types';
import { deliverInvite } from './deliver';
import { loadOpenInvite } from './queries';
import { newInviteNonce } from './token';
import { STAFF_ROLES, higherRole, type InviteRow } from './types';

export interface InviteActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 14;
const ROLES: ECUserRole[] = ['church_admin', 'campus_admin', 'connector', 'participant'];

function clean(fd: FormData, key: string, max = 100): string | null {
  const v = String(fd.get(key) ?? '').trim();
  return v ? v.slice(0, max) : null;
}

function isChurchAdmin(session: SessionUser): boolean {
  return session.profile?.role === 'church_admin' || Boolean(session.profile?.is_platform_admin);
}

interface NewInvite {
  churchId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: ECUserRole;
  campusId: string | null;
  participantId?: string | null;
  groupIds?: string[];
  invitedBy: string;
  /** Church admins (and the platform) may set or replace a staff invite. */
  mayInviteStaff: boolean;
}

/**
 * Opens an invite for (church, email), or refreshes the open one with a new
 * nonce, so the newest email is the only link that works. Someone who
 * already has an account is moved from People instead, not invited.
 *
 * Not exported: every export of a server-action file is callable from the browser.
 */
async function openInvite(
  admin: SupabaseClient,
  v: NewInvite,
): Promise<{ invite?: InviteRow; error?: string; refreshed?: boolean }> {
  const { data: existing } = await admin.from('profiles').select('id, church_id').eq('email', v.email).limit(1);
  const prof = ((existing ?? []) as Array<{ id: string; church_id: string | null }>)[0];
  if (prof) {
    return {
      error:
        prof.church_id === v.churchId
          ? 'They already have an account here. Change their role from People.'
          : 'That email belongs to an account at another church.',
    };
  }

  const { data: openRow } = await admin
    .from('church_invites')
    .select('*')
    .eq('church_id', v.churchId)
    .eq('email', v.email)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle();
  const open = openRow as InviteRow | null;
  if (open && STAFF_ROLES.includes(open.role) && !v.mayInviteStaff) {
    return { error: 'A staff invite is already open for this email. A church admin can change it.' };
  }

  const fields = {
    first_name: v.firstName,
    last_name: v.lastName,
    phone: v.phone,
    role: v.role,
    campus_id: v.campusId,
    participant_id: v.participantId ?? open?.participant_id ?? null,
    group_ids: v.groupIds ?? open?.group_ids ?? [],
    nonce: newInviteNonce(),
    expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
    invited_by: v.invitedBy,
  };

  if (open) {
    const { data, error } = await admin
      .from('church_invites')
      .update({ ...fields, send_count: open.send_count + 1 })
      .eq('id', open.id)
      .select('*')
      .single();
    if (error || !data) return { error: error?.message ?? 'Could not refresh the invite.' };
    return { invite: data as InviteRow, refreshed: true };
  }
  const { data, error } = await admin
    .from('church_invites')
    .insert({ ...fields, church_id: v.churchId, email: v.email, send_count: 1 })
    .select('*')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not create the invite.' };
  return { invite: data as InviteRow };
}

/** /people/invite: staff (church admins) or members (campus admins too). */
export async function inviteToChurch(_prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const role = String(formData.get('role') ?? 'participant') as ECUserRole;
  if (!ROLES.includes(role)) return { ok: false, error: 'Pick a role.' };
  const mayInviteStaff = isChurchAdmin(session);
  if (STAFF_ROLES.includes(role) && !mayInviteStaff) {
    return { ok: false, error: 'Only a church admin invites staff.' };
  }

  const email = (clean(formData, 'email', 254) ?? '').toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  let campusId = clean(formData, 'campus_id', 40);
  if (!campusId && session.profile?.role === 'campus_admin') campusId = session.profile.campus_id ?? null;
  if (role === 'campus_admin' && !campusId) return { ok: false, error: 'A campus admin needs a campus.' };

  const admin = await createServiceRoleClient();
  if (campusId) {
    const { data: campus } = await admin.from('campuses').select('church_id').eq('id', campusId).maybeSingle();
    if ((campus as { church_id: string } | null)?.church_id !== churchId) {
      return { ok: false, error: 'That campus is not part of your church.' };
    }
  }

  const opened = await openInvite(admin, {
    churchId,
    email,
    firstName: clean(formData, 'first_name'),
    lastName: clean(formData, 'last_name'),
    phone: clean(formData, 'phone', 32),
    role,
    campusId,
    invitedBy: session.id,
    mayInviteStaff,
  });
  if (!opened.invite) return { ok: false, error: opened.error };

  const delivery = await deliverInvite(admin, opened.invite, { immediate: true });
  await recordAudit({
    action: opened.refreshed ? 'invite.resent' : 'invite.sent',
    entity_type: 'church_invite',
    entity_id: opened.invite.id,
    metadata: { email, role, campus_id: campusId, delivered: delivery.sent },
  });
  revalidatePath('/people');
  if (!delivery.ok) return { ok: false, error: `The invite is saved, but the email failed: ${delivery.error}` };
  return {
    ok: true,
    message: delivery.sent ? `Invite sent to ${email}.` : `Invite queued for ${email}. It goes out within a few minutes.`,
  };
}

async function loadManagedInvite(session: SessionUser, inviteId: string): Promise<InviteRow | { error: string }> {
  // Through the admin's own client: RLS limits this to their church.
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('church_invites').select('*').eq('id', inviteId).maybeSingle();
  const invite = data as InviteRow | null;
  if (!invite) return { error: 'Invite not found.' };
  if (STAFF_ROLES.includes(invite.role) && !isChurchAdmin(session)) {
    return { error: 'Only a church admin manages staff invites.' };
  }
  if (invite.accepted_at || invite.revoked_at) return { error: 'That invite is closed.' };
  return invite;
}

export async function resendInvite(inviteId: string): Promise<InviteActionResult> {
  const session = await requireCampusAdmin();
  const found = await loadManagedInvite(session, inviteId);
  if ('error' in found) return { ok: false, error: found.error };

  const admin = await createServiceRoleClient();
  const { data, error } = await admin
    .from('church_invites')
    .update({
      nonce: newInviteNonce(),
      expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
      send_count: found.send_count + 1,
    })
    .eq('id', found.id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not resend.' };
  const delivery = await deliverInvite(admin, data as InviteRow, { immediate: true });
  await recordAudit({ action: 'invite.resent', entity_type: 'church_invite', entity_id: found.id, metadata: { email: found.email } });
  revalidatePath('/people');
  revalidatePath(`/platform/churches/${found.church_id}`);
  if (!delivery.ok) return { ok: false, error: delivery.error };
  return { ok: true, message: delivery.sent ? 'Sent again. Older links no longer work.' : 'Queued again. Older links no longer work.' };
}

export async function revokeInvite(inviteId: string): Promise<InviteActionResult> {
  const session = await requireCampusAdmin();
  const found = await loadManagedInvite(session, inviteId);
  if ('error' in found) return { ok: false, error: found.error };
  const admin = await createServiceRoleClient();
  const { error } = await admin
    .from('church_invites')
    .update({ revoked_at: new Date().toISOString(), revoked_by: session.id })
    .eq('id', found.id)
    .is('accepted_at', null);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ action: 'invite.revoked', entity_type: 'church_invite', entity_id: found.id, metadata: { email: found.email } });
  revalidatePath('/people');
  revalidatePath(`/platform/churches/${found.church_id}`);
  return { ok: true, message: 'Invite withdrawn.' };
}

/** Platform admin: a new church's first admin, invited under the church's own name. */
export async function inviteFirstAdmin(churchId: string, _prev: InviteActionResult | null, formData: FormData): Promise<InviteActionResult> {
  const session = await requirePlatformAdmin();
  const email = (clean(formData, 'email', 254) ?? '').toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const admin = await createServiceRoleClient();
  const { data: campuses } = await admin
    .from('campuses')
    .select('id')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('created_at')
    .limit(1);
  const opened = await openInvite(admin, {
    churchId,
    email,
    firstName: clean(formData, 'first_name'),
    lastName: clean(formData, 'last_name'),
    phone: null,
    role: 'church_admin',
    campusId: ((campuses ?? []) as Array<{ id: string }>)[0]?.id ?? null,
    invitedBy: session.id,
    mayInviteStaff: true,
  });
  if (!opened.invite) return { ok: false, error: opened.error };
  const delivery = await deliverInvite(admin, opened.invite, { immediate: true, fromPlatform: true });
  await recordAudit({
    action: 'invite.first_admin',
    entity_type: 'church_invite',
    entity_id: opened.invite.id,
    metadata: { church_id: churchId, email, delivered: delivery.sent },
  });
  revalidatePath(`/platform/churches/${churchId}`);
  if (!delivery.ok) return { ok: false, error: `The invite is saved, but the email failed: ${delivery.error}` };
  return { ok: true, message: delivery.sent ? `Invite sent to ${email}.` : `Invite queued for ${email}.` };
}

// ── Accepting ─────────────────────────────────────────────────

interface Applied {
  ok: boolean;
  error?: string;
}

/**
 * Makes the account what the invite says: in the invite's church, at least
 * the invite's role (never lower), a connector row for connectors, the
 * imported person's record linked or a confirmed member record created,
 * and the groups the import named.
 */
async function applyInvite(
  admin: SupabaseClient,
  invite: InviteRow,
  userId: string,
  info: { firstName: string; lastName: string; phone: string | null; smsConsentAt: string | null },
): Promise<Applied> {
  const { data: p } = await admin
    .from('profiles')
    .select('id, church_id, campus_id, role, phone')
    .eq('id', userId)
    .maybeSingle();
  const profile = p as Pick<Profile, 'id' | 'church_id' | 'campus_id' | 'role' | 'phone'> | null;
  if (profile?.church_id && profile.church_id !== invite.church_id) {
    return {
      ok: false,
      error: 'Your account belongs to another church. Belonging to more than one church is coming; for now, ask this church to invite a different email.',
    };
  }

  const role = profile ? higherRole(profile.role, invite.role) : invite.role;
  if (!profile) {
    const { error } = await admin.from('profiles').insert({
      id: userId,
      role,
      church_id: invite.church_id,
      campus_id: invite.campus_id,
      is_platform_admin: false,
      first_name: info.firstName,
      last_name: info.lastName,
      email: invite.email,
      phone: info.phone,
      sms_consent_at: info.phone ? info.smsConsentAt : null,
      sms_consent_source: info.phone && info.smsConsentAt ? 'invite_accept' : null,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin
      .from('profiles')
      .update({
        church_id: invite.church_id,
        role,
        campus_id: profile.campus_id ?? invite.campus_id,
        phone: profile.phone ?? info.phone,
      })
      .eq('id', userId);
    if (error) return { ok: false, error: error.message };
  }

  if (role === 'connector') {
    const { data: conn } = await admin
      .from('connectors')
      .select('id')
      .eq('church_id', invite.church_id)
      .eq('profile_id', userId)
      .limit(1);
    if (!((conn ?? []) as unknown[]).length) {
      const { error } = await admin
        .from('connectors')
        .insert({ church_id: invite.church_id, profile_id: userId, campus_id: invite.campus_id, is_active: true });
      if (error) return { ok: false, error: error.message };
    }
  }

  if (invite.role === 'participant') {
    const { data: mine } = await admin
      .from('participants')
      .select('id')
      .eq('church_id', invite.church_id)
      .eq('profile_id', userId)
      .limit(1);
    const already = ((mine ?? []) as Array<{ id: string }>)[0];
    let linked = Boolean(already);
    if (invite.participant_id && !already) {
      // The person the church imported: link the account to their record.
      const { data: link, error } = await admin
        .from('participants')
        .update({ profile_id: userId, ...(info.phone ? { phone: info.phone } : {}) })
        .eq('id', invite.participant_id)
        .is('profile_id', null)
        .select('id');
      if (error) return { ok: false, error: error.message };
      linked = ((link ?? []) as unknown[]).length > 0;
    }
    if (!linked) {
      const { error } = await admin.from('participants').insert({
        church_id: invite.church_id,
        campus_id: invite.campus_id,
        profile_id: userId,
        first_name: info.firstName,
        last_name: info.lastName,
        email: invite.email,
        phone: info.phone,
        // Invited by an admin as a member: confirmed, with standing.
        status: 'connected',
        joined_as: 'member',
        member_confirmed_at: invite.created_at,
        member_confirmed_by: invite.invited_by,
        signed_up_at: new Date().toISOString(),
        sms_consent_at: info.phone ? info.smsConsentAt : null,
        sms_consent_source: info.phone && info.smsConsentAt ? 'invite_accept' : null,
      });
      if (error) return { ok: false, error: error.message };
    }
  }

  if (invite.group_ids.length) {
    const { data: groups } = await admin
      .from('groups')
      .select('id')
      .eq('church_id', invite.church_id)
      .eq('is_active', true)
      .in('id', invite.group_ids);
    const rows = ((groups ?? []) as Array<{ id: string }>).map((g) => ({ group_id: g.id, profile_id: userId, role: 'member' }));
    if (rows.length) {
      await admin.from('group_members').upsert(rows, { onConflict: 'group_id,profile_id', ignoreDuplicates: true });
    }
  }
  return { ok: true };
}

export interface AcceptResult {
  ok: boolean;
  error?: string;
}

export async function acceptInvite(code: string, _prev: AcceptResult | null, formData: FormData): Promise<AcceptResult> {
  const admin = await createServiceRoleClient();
  const found = await loadOpenInvite(admin, code);
  if ('error' in found) return { ok: false, error: found.error };
  const invite = found.invite;

  const password = String(formData.get('password') ?? '');
  const firstName = clean(formData, 'first_name') ?? invite.first_name ?? '';
  const lastName = clean(formData, 'last_name') ?? invite.last_name ?? '';
  const phone = clean(formData, 'phone', 32) ?? invite.phone;
  const smsConsentAt = phone && formData.get('sms_consent') === 'on' ? new Date().toISOString() : null;
  if (STAFF_ROLES.includes(invite.role) && !phone) {
    return { ok: false, error: 'Add a mobile number so your team can reach you.' };
  }

  const supabase = await createServerSupabaseClient();
  const session = await getSession();
  let userId: string;
  let newAccount = false;

  if (session) {
    if ((session.email ?? '').toLowerCase() !== invite.email) {
      return { ok: false, error: `You're signed in as ${session.email}, and this invite is for ${invite.email}. Sign out, then open the link again.` };
    }
    userId = session.id;
  } else {
    const { data: existing } = await admin.from('profiles').select('id').eq('email', invite.email).limit(1);
    if (((existing ?? []) as unknown[]).length) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      if (error || !data.user) {
        return { ok: false, error: 'That password did not match. If you forgot it, use a sign-in link from the front page, then open this invite again.' };
      }
      userId = data.user.id;
    } else {
      if (!firstName || !lastName) return { ok: false, error: 'Enter your first and last name.' };
      if (password.length < 8) return { ok: false, error: 'Choose a password of at least 8 characters.' };
      // The link reached this inbox, so the email is confirmed.
      const { data: created, error } = await admin.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { first_name: firstName, last_name: lastName },
      });
      if (error || !created.user) {
        return {
          ok: false,
          error: /registered|exists/i.test(error?.message ?? '')
            ? 'An account with this email already exists. Sign in from the front page, then open this invite again.'
            : (error?.message ?? 'Could not create your account.'),
        };
      }
      userId = created.user.id;
      newAccount = true;
    }
  }

  // Claim the invite before applying it, so it is used exactly once.
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('church_invites')
    .update({ accepted_at: now, accepted_profile_id: null })
    .eq('id', invite.id)
    .eq('nonce', invite.nonce)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', now)
    .select('id');
  if (!((claimed ?? []) as unknown[]).length) {
    if (newAccount) await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: 'This invite was just used or replaced. Ask the church for a new one.' };
  }

  const applied = await applyInvite(admin, invite, userId, { firstName, lastName, phone, smsConsentAt });
  if (!applied.ok) {
    await admin.from('church_invites').update({ accepted_at: null }).eq('id', invite.id);
    if (newAccount) await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: applied.error };
  }
  await admin.from('church_invites').update({ accepted_profile_id: userId }).eq('id', invite.id);

  // The person has no session yet in this request, so the audit row is
  // written directly, attributed to them.
  await admin.from('audit_log').insert({
    church_id: invite.church_id,
    actor_id: userId,
    actor_label: `${firstName} ${lastName}`.trim() || invite.email,
    action: 'invite.accepted',
    entity_type: 'church_invite',
    entity_id: invite.id,
    metadata: { role: invite.role, new_account: newAccount },
  });

  if (newAccount) {
    const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
    if (error) redirect('/?welcome=1');
  }

  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();
  revalidatePath('/', 'layout');
  redirect(await landingForSession({ id: userId, email: invite.email, profile: (profile as Profile | null) ?? null }));
}
