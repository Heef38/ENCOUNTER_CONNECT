'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { DocVisibility } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const VISIBILITIES: DocVisibility[] = ['staff', 'participants', 'public'];

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

function parseVisibility(raw: FormDataEntryValue | null): DocVisibility {
  const v = String(raw ?? 'staff');
  return (VISIBILITIES.includes(v as DocVisibility) ? v : 'staff') as DocVisibility;
}

export async function createConnectDoc(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const file_url = nullable(formData.get('file_url'));
  const campus_id = nullable(formData.get('campus_id'));
  const visibility = parseVisibility(formData.get('visibility'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('connect_docs')
    .insert({
      church_id: churchId,
      campus_id,
      title,
      description,
      body,
      file_url,
      visibility,
      is_active,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connect_doc.create',
    entity_type: 'connect_doc',
    entity_id: data.id,
    metadata: { title, visibility, campus_id },
  });

  revalidatePath('/settings/connect-docs');
  return { ok: true, id: data.id };
}

export async function updateConnectDoc(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const file_url = nullable(formData.get('file_url'));
  const campus_id = nullable(formData.get('campus_id'));
  const visibility = parseVisibility(formData.get('visibility'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('connect_docs')
    .update({
      title,
      description,
      body,
      file_url,
      campus_id,
      visibility,
      is_active,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'connect_doc.update',
    entity_type: 'connect_doc',
    entity_id: id,
    metadata: { title, visibility, is_active },
  });

  revalidatePath('/settings/connect-docs');
  revalidatePath(`/settings/connect-docs/${id}`);
  return { ok: true, id };
}

export async function deleteConnectDoc(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('connect_docs').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    action: 'connect_doc.delete',
    entity_type: 'connect_doc',
    entity_id: id,
  });
  revalidatePath('/settings/connect-docs');
  redirect('/settings/connect-docs');
}
