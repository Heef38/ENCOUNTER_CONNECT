'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { normalizePhone } from '@/lib/import/csv';
import { enqueueEventCancelled } from '@/lib/notifications/events';
import { siteUrl } from '@/lib/site';
import { emailHash, phoneHash } from './email-hash';

/**
 * A person's own account (rethink §7.9). They own their name, phone, email,
 * password and texting consent. Deleting the account cancels gatherings
 * they were going to host, takes their name and contact details off their
 * church's record of them, and removes the login. Their church keeps its
 * ministry records.
 */

export interface AccountResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateMyDetails(_prev: AccountResult | null, formData: FormData): Promise<AccountResult> {
  const session = await requireAuth();
  const first = String(formData.get('first_name') ?? '').trim().slice(0, 100);
  const last = String(formData.get('last_name') ?? '').trim().slice(0, 100);
  const rawPhone = String(formData.get('phone') ?? '').trim();
  if (!first || !last) return { ok: false, error: 'Enter your first and last name.' };
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) return { ok: false, error: 'Enter a mobile number like (432) 555-1234.' };
  const wantsTexts = formData.get('sms_consent') === 'on';
  if (wantsTexts && !phone) return { ok: false, error: 'Add a mobile number to get texts.' };

  const consentAt = session.profile?.sms_consent_at ?? null;
  const phoneChanged = (session.profile?.phone ?? null) !== phone;
  // Consent is to texts at a number: a new number asks again.
  const nextConsent = wantsTexts ? (consentAt && !phoneChanged ? consentAt : new Date().toISOString()) : null;

  // Their own row, through their own client (029 lets only the person set
  // their consent).
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      first_name: first,
      last_name: last,
      phone,
      sms_consent_at: nextConsent,
      sms_consent_source: nextConsent ? (nextConsent === consentAt ? (session.profile?.sms_consent_source ?? 'profile_settings') : 'profile_settings') : null,
    })
    .eq('id', session.id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Could not save your details.' };

  // Keep the church's record of them in step. Participants can't write
  // that row themselves, so the server does, for exactly these fields.
  const admin = await createServiceRoleClient();
  await admin
    .from('participants')
    .update({
      first_name: first,
      last_name: last,
      phone,
      sms_consent_at: nextConsent,
      sms_consent_source: nextConsent ? 'profile_settings' : null,
    })
    .eq('profile_id', session.id);

  await recordAudit({
    action: 'account.details_updated',
    entity_type: 'profile',
    entity_id: session.id,
    metadata: { sms_consent: Boolean(nextConsent), phone_changed: phoneChanged },
  });
  revalidatePath('/account');
  return { ok: true, message: 'Saved.' };
}

export async function changeMyEmail(_prev: AccountResult | null, formData: FormData): Promise<AccountResult> {
  const session = await requireAuth();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (email === (session.email ?? '').toLowerCase()) return { ok: false, error: 'That is already your email.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl()}/auth/confirm?next=/account` },
  );
  if (error) return { ok: false, error: error.message };
  await recordAudit({ action: 'account.email_change_requested', entity_type: 'profile', entity_id: session.id });
  return {
    ok: true,
    message: `Check ${email} for a confirmation link. Your email changes once you open it.`,
  };
}

export async function changeMyPassword(_prev: AccountResult | null, formData: FormData): Promise<AccountResult> {
  const session = await requireAuth();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' };
  if (password !== confirm) return { ok: false, error: 'The two passwords don’t match.' };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  await recordAudit({ action: 'account.password_changed', entity_type: 'profile', entity_id: session.id });
  return { ok: true, message: 'Password changed.' };
}

export async function deleteMyAccount(_prev: AccountResult | null, formData: FormData): Promise<AccountResult> {
  const session = await requireAuth();
  const profile = session.profile;
  const email = (session.email ?? profile?.email ?? '').toLowerCase();
  if (String(formData.get('confirm') ?? '').trim().toLowerCase() !== 'delete') {
    return { ok: false, error: 'Type delete to confirm.' };
  }
  if (profile?.is_platform_admin) return { ok: false, error: 'A platform admin account is removed by another platform admin.' };
  if (profile && profile.role !== 'participant') {
    return {
      ok: false,
      error: 'You’re on your church’s staff. Ask a church admin to change your role first, so the people and schedules you look after are handed on.',
    };
  }

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  // 1. Cancel gatherings they were going to host, and tell whoever was coming.
  const { data: hosting } = await supabase
    .from('events')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'The host is no longer able to host.',
      cancelled_by_profile_id: session.id,
    })
    .eq('host_profile_id', session.id)
    .in('status', ['published', 'draft'])
    .gt('starts_at', new Date().toISOString())
    .select('id');
  const cancelled = ((hosting ?? []) as Array<{ id: string }>).map((e) => e.id);
  for (const id of cancelled) {
    try {
      await enqueueEventCancelled(admin, { eventId: id, reason: 'The host is no longer able to host.', cancelledBy: session.id });
    } catch (err) {
      console.error('[account] cancel notice failed', err);
    }
  }

  // 2. The audit row keeps hashes of the email and phone, so a blocked host
  //    who comes back under either is noticed. Written before the account goes.
  await admin.from('audit_log').insert({
    church_id: profile?.church_id ?? null,
    actor_id: session.id,
    actor_label: 'Deleted account',
    action: 'account.deleted',
    entity_type: 'profile',
    entity_id: session.id,
    metadata: {
      email_sha256: email ? emailHash(email) : null,
      phone_sha256: phoneHash(profile?.phone),
      was_blocked_host: Boolean(profile?.host_blocked_at),
      cancelled_gatherings: cancelled.length,
    },
  });

  // 3. Their church's record of them stays, without who they are.
  await admin
    .from('participants')
    .update({
      first_name: 'Former',
      last_name: 'member',
      email: null,
      phone: null,
      notes: null,
      external_id: null,
      sms_consent_at: null,
      sms_consent_source: null,
      status: 'inactive',
    })
    .eq('profile_id', session.id);

  // 4. The login. Group memberships, RSVPs and lesson completions go with
  //    the profile; gatherings they hosted keep their record without a host.
  await supabase.auth.signOut();
  const { error } = await admin.auth.admin.deleteUser(session.id);
  if (error) {
    console.error('[account] auth delete failed', error.message);
    return { ok: false, error: 'Your details were removed, but the login could not be deleted. Contact your church.' };
  }
  revalidatePath('/', 'layout');
  redirect('/?deleted=1');
}
