'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireChurchAdmin, requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { ECUserRole } from '@/lib/church/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_ROLES: ECUserRole[] = [
  'church_admin',
  'campus_admin',
  'connector',
  'participant',
];

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

export async function setProfileRole(
  profileId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireChurchAdmin();

  const roleRaw = String(formData.get('role') ?? '');
  if (!VALID_ROLES.includes(roleRaw as ECUserRole)) {
    return { ok: false, error: 'Invalid role.' };
  }
  const role = roleRaw as ECUserRole;
  const campus_id = nullable(formData.get('campus_id'));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('profiles')
    .update({ role, campus_id })
    .eq('id', profileId);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'profile.role_change',
    entity_type: 'profile',
    entity_id: profileId,
    metadata: { role, campus_id },
  });

  revalidatePath('/people');
  return { ok: true };
}

const STAFF_ROLES: ECUserRole[] = ['church_admin', 'campus_admin', 'connector'];

/**
 * Creates a brand-new staff member from scratch: an auth user (email
 * pre-confirmed so they can sign in immediately with the temporary
 * password), a profile with the chosen staff role, and — for connectors —
 * a connectors row so they appear in the right section and can be
 * scheduled. Church-admin+ only; the new account is scoped to the
 * inviter's church. Everything runs via service-role since the target
 * user has no session yet and participant-scoped RLS can't self-write.
 */
export async function inviteStaff(formData: FormData): Promise<ActionResult> {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const first_name = String(formData.get('first_name') ?? '').trim();
  const last_name = String(formData.get('last_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const phone = nullable(formData.get('phone'));
  const roleRaw = String(formData.get('role') ?? '');
  const campus_id = nullable(formData.get('campus_id'));

  if (!first_name || !last_name) return { ok: false, error: 'Enter a first and last name.' };
  if (!email) return { ok: false, error: 'Email is required.' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'Temporary password must be at least 8 characters.' };
  }
  if (!STAFF_ROLES.includes(roleRaw as ECUserRole)) {
    return { ok: false, error: 'Pick a role.' };
  }
  const role = roleRaw as ECUserRole;
  if (!phone) return { ok: false, error: 'A mobile number is required.' };
  if (role === 'campus_admin' && !campus_id) {
    return { ok: false, error: 'Campus admins must be assigned to a campus.' };
  }

  const admin = await createServiceRoleClient();

  // Validate the campus belongs to this church when one was chosen.
  if (campus_id) {
    const { data: campus } = await admin
      .from('campuses')
      .select('id, church_id')
      .eq('id', campus_id)
      .maybeSingle();
    if (!campus || campus.church_id !== churchId) {
      return { ok: false, error: 'That campus is not part of your church.' };
    }
  }

  // Create the auth user. email_confirm skips the verification email so
  // they can sign in right away with the temporary password.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name },
  });
  if (authErr || !created.user) {
    // Most common cause: the email is already registered.
    return { ok: false, error: authErr?.message ?? 'Could not create the account.' };
  }
  const userId = created.user.id;

  const { error: profErr } = await admin.from('profiles').upsert(
    {
      id: userId,
      role,
      church_id: churchId,
      campus_id,
      is_platform_admin: false,
      first_name,
      last_name,
      email,
      phone,
    },
    { onConflict: 'id' },
  );
  if (profErr) {
    // Roll back the orphaned auth user (cascades the profile if it landed).
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: profErr.message };
  }

  if (role === 'connector') {
    const { error: connErr } = await admin.from('connectors').insert({
      church_id: churchId,
      profile_id: userId,
      campus_id,
      is_active: true,
    });
    if (connErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return { ok: false, error: connErr.message };
    }
  }

  await recordAudit({
    action: 'profile.invited',
    entity_type: 'profile',
    entity_id: userId,
    metadata: { role, church_id: churchId, campus_id, email },
  });

  revalidatePath('/people');
  return { ok: true };
}

/**
 * Promotes an existing profile (must already be in the church) to the
 * given role and optionally assigns a campus.
 */
export async function promoteProfile(formData: FormData): Promise<ActionResult> {
  await requireChurchAdmin();

  const profile_id = nullable(formData.get('profile_id'));
  if (!profile_id) return { ok: false, error: 'Pick a person.' };

  const roleRaw = String(formData.get('role') ?? '');
  if (!VALID_ROLES.includes(roleRaw as ECUserRole)) {
    return { ok: false, error: 'Invalid role.' };
  }
  const role = roleRaw as ECUserRole;
  const campus_id = nullable(formData.get('campus_id'));
  const phone = nullable(formData.get('phone'));

  if (role === 'campus_admin' && !campus_id) {
    return { ok: false, error: 'Campus admins must be assigned to a campus.' };
  }
  if (!phone) {
    return { ok: false, error: 'A mobile number is required.' };
  }

  const supabase = await createServerSupabaseClient();

  // Admins must be reachable by email too.
  const { data: prof } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', profile_id)
    .maybeSingle();
  if (!prof?.email) {
    return { ok: false, error: 'This person needs an email on their profile first.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      role,
      campus_id: role === 'campus_admin' ? campus_id : campus_id,
      phone,
    })
    .eq('id', profile_id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'profile.promote',
    entity_type: 'profile',
    entity_id: profile_id,
    metadata: { role, campus_id },
  });

  revalidatePath('/people');
  return { ok: true };
}

/**
 * Permanently deletes a staff member's account: removes their auth user,
 * which cascades the profile (profiles.id → auth.users ON DELETE CASCADE)
 * and any connector record (connectors.profile_id ON DELETE CASCADE).
 * Participants they touched have their profile_id / assigned_connector_id
 * set to NULL by FK rules. Church-admin+ only, scoped to their church.
 * Irreversible.
 */
export async function deleteStaffAccount(profileId: string): Promise<ActionResult> {
  const session = await requireChurchAdmin();
  const isPlatform = session.profile?.is_platform_admin ?? false;

  // You can't delete the account you're signed in as.
  if (profileId === session.id) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const admin = await createServiceRoleClient();
  const { data: target } = await admin
    .from('profiles')
    .select('id, church_id, is_platform_admin')
    .eq('id', profileId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Profile not found.' };

  // Tenant safety: a church admin may only delete their own church's people.
  if (!isPlatform && target.church_id !== session.profile?.church_id) {
    return { ok: false, error: 'Not authorized for this person.' };
  }
  // Only a platform admin may remove another platform admin.
  if (target.is_platform_admin && !isPlatform) {
    return { ok: false, error: 'Only a platform admin can remove a platform admin.' };
  }

  // Deleting the auth user cascades the profile and connector record.
  try {
    const { error } = await admin.auth.admin.deleteUser(profileId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed.' };
  }

  await recordAudit({
    action: 'profile.deleted',
    entity_type: 'profile',
    entity_id: profileId,
    metadata: { church_id: target.church_id },
  });

  revalidatePath('/people');
  return { ok: true };
}

/**
 * Removes a connector record. Profile and any auth user remain.
 */
export async function removeConnectorRecord(connectorId: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('connectors').delete().eq('id', connectorId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connector.delete',
    entity_type: 'connector',
    entity_id: connectorId,
  });

  revalidatePath('/people');
  return { ok: true };
}
