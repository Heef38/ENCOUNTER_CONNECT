'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import {
  uploadConnectDocFile,
  deleteConnectDocFile,
} from '@/lib/storage/files';
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

/**
 * Uploaded file wins over the URL text field. Returns the value to store in
 * file_url (storage path for uploads, https URL for links) or an error.
 */
async function resolveFileField(
  formData: FormData,
  churchId: string,
): Promise<{ ok: true; file_url: string | null; uploaded: boolean } | { ok: false; error: string }> {
  const upload = formData.get('file');
  if (upload instanceof File && upload.size > 0) {
    const admin = await createServiceRoleClient();
    const result = await uploadConnectDocFile(admin, churchId, upload);
    if (!result.ok || !result.value) {
      return { ok: false, error: result.error ?? 'Upload failed.' };
    }
    return { ok: true, file_url: result.value, uploaded: true };
  }
  return { ok: true, file_url: nullable(formData.get('file_url')), uploaded: false };
}

export async function createConnectDoc(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const campus_id = nullable(formData.get('campus_id'));
  const visibility = parseVisibility(formData.get('visibility'));
  const is_active = formData.get('is_active') === 'on';

  const fileField = await resolveFileField(formData, churchId);
  if (!fileField.ok) return { ok: false, error: fileField.error };
  const file_url = fileField.file_url;

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
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const campus_id = nullable(formData.get('campus_id'));
  const visibility = parseVisibility(formData.get('visibility'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();

  // Existing file_url decides whether we must clean up a stored object when
  // it gets replaced or removed.
  const { data: existingRow } = await supabase
    .from('connect_docs')
    .select('file_url')
    .eq('id', id)
    .maybeSingle();
  const existing = (existingRow as { file_url: string | null } | null)?.file_url ?? null;
  const existingIsStored = !!existing && !/^https?:\/\//i.test(existing);

  const fileField = await resolveFileField(formData, churchId);
  if (!fileField.ok) return { ok: false, error: fileField.error };

  const removeFile = formData.get('remove_file') === 'on';
  let file_url: string | null;
  if (fileField.uploaded) {
    file_url = fileField.file_url;
  } else if (removeFile) {
    file_url = null;
  } else if (fileField.file_url) {
    // URL typed into the text field replaces whatever was there.
    file_url = fileField.file_url;
  } else {
    // Empty URL field: a stored upload stays (the form never shows its path
    // in the URL input); an external link that was cleared means removal.
    file_url = existingIsStored ? existing : null;
  }

  if (existingIsStored && existing !== file_url) {
    const admin = await createServiceRoleClient();
    await deleteConnectDocFile(admin, existing);
  }

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

  const { data: existingRow } = await supabase
    .from('connect_docs')
    .select('file_url')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase.from('connect_docs').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  const existing = (existingRow as { file_url: string | null } | null)?.file_url ?? null;
  if (existing) {
    const admin = await createServiceRoleClient();
    await deleteConnectDocFile(admin, existing);
  }
  await recordAudit({
    action: 'connect_doc.delete',
    entity_type: 'connect_doc',
    entity_id: id,
  });
  revalidatePath('/settings/connect-docs');
  redirect('/settings/connect-docs');
}
