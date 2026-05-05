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

export async function createConnector(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const profile_id = nullable(formData.get('profile_id'));
  if (!profile_id) return { ok: false, error: 'Pick a person.' };

  const campus_id = nullable(formData.get('campus_id'));
  const scheduling_resource_id = nullable(formData.get('scheduling_resource_id'));
  const is_active = formData.get('is_active') !== 'off';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('connectors')
    .insert({
      church_id: churchId,
      profile_id,
      campus_id,
      scheduling_resource_id,
      is_active,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connector.create',
    entity_type: 'connector',
    entity_id: data.id,
    metadata: { profile_id, campus_id },
  });

  revalidatePath('/connectors');
  return { ok: true, id: data.id };
}

export async function updateConnector(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const campus_id = nullable(formData.get('campus_id'));
  const scheduling_resource_id = nullable(formData.get('scheduling_resource_id'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('connectors')
    .update({ campus_id, scheduling_resource_id, is_active })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connector.update',
    entity_type: 'connector',
    entity_id: id,
    metadata: { campus_id, is_active },
  });

  revalidatePath('/connectors');
  revalidatePath(`/connectors/${id}`);
  return { ok: true, id };
}

export async function deleteConnector(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('connectors').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connector.delete',
    entity_type: 'connector',
    entity_id: id,
  });

  revalidatePath('/connectors');
  redirect('/connectors');
}
