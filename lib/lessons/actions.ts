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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseOrderIndex(raw: FormDataEntryValue | null, fallback = 0): number {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function createLesson(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(title);
  const body = String(formData.get('body') ?? '');
  const video_url = String(formData.get('video_url') ?? '').trim();
  const order_index = parseOrderIndex(formData.get('order_index'));
  const is_published = formData.get('is_published') === 'on';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('lessons')
    .insert({
      church_id: churchId,
      title,
      slug: slug || null,
      body: body || null,
      video_url: video_url || null,
      order_index,
      is_published,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'lesson.create',
    entity_type: 'lesson',
    entity_id: data.id,
    metadata: { title, slug, is_published },
  });

  revalidatePath('/settings/lessons');
  return { ok: true, id: data.id };
}

export async function updateLesson(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const body = String(formData.get('body') ?? '');
  const video_url = String(formData.get('video_url') ?? '').trim();
  const order_index = parseOrderIndex(formData.get('order_index'));
  const is_published = formData.get('is_published') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('lessons')
    .update({
      title,
      slug: slugRaw ? slugify(slugRaw) : slugify(title),
      body: body || null,
      video_url: video_url || null,
      order_index,
      is_published,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'lesson.update',
    entity_type: 'lesson',
    entity_id: id,
    metadata: { title, is_published },
  });

  revalidatePath('/settings/lessons');
  revalidatePath(`/settings/lessons/${id}`);
  return { ok: true, id };
}

export async function deleteLesson(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'lesson.delete',
    entity_type: 'lesson',
    entity_id: id,
  });

  revalidatePath('/settings/lessons');
  redirect('/settings/lessons');
}

export async function setLessonPublished(
  id: string,
  is_published: boolean,
): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('lessons')
    .update({ is_published })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: is_published ? 'lesson.publish' : 'lesson.unpublish',
    entity_type: 'lesson',
    entity_id: id,
  });

  revalidatePath('/settings/lessons');
  return { ok: true };
}
