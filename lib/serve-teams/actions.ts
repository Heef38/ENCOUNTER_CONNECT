'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

export async function createServeTeam(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const description = nullable(formData.get('description'));
  const campus_id = nullable(formData.get('campus_id'));
  const leader_profile_id = nullable(formData.get('leader_profile_id'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('serve_teams')
    .insert({
      church_id: churchId,
      campus_id,
      name,
      description,
      leader_profile_id,
      is_active,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'serve_team.create',
    entity_type: 'serve_team',
    entity_id: data.id,
    metadata: { name, campus_id },
  });

  revalidatePath('/settings/serve-teams');
  return { ok: true, id: data.id };
}

export async function updateServeTeam(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const description = nullable(formData.get('description'));
  const campus_id = nullable(formData.get('campus_id'));
  const leader_profile_id = nullable(formData.get('leader_profile_id'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('serve_teams')
    .update({ name, description, campus_id, leader_profile_id, is_active })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'serve_team.update',
    entity_type: 'serve_team',
    entity_id: id,
    metadata: { name, is_active },
  });

  revalidatePath('/settings/serve-teams');
  revalidatePath(`/settings/serve-teams/${id}`);
  return { ok: true, id };
}

export async function deleteServeTeam(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('serve_teams').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    action: 'serve_team.delete',
    entity_type: 'serve_team',
    entity_id: id,
  });
  revalidatePath('/settings/serve-teams');
  redirect('/settings/serve-teams');
}
