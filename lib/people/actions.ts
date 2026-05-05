'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

  if (role === 'campus_admin' && !campus_id) {
    return { ok: false, error: 'Campus admins must be assigned to a campus.' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      role,
      campus_id: role === 'campus_admin' ? campus_id : campus_id,
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
