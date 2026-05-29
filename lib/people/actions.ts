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
