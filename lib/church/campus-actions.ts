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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function createCampus(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const location = nullable(formData.get('location'));
  const scheduling_location_id = nullable(formData.get('scheduling_location_id'));
  const is_active = formData.get('is_active') === 'on';
  const hero_image_url = nullable(formData.get('hero_image_url'));
  const intro_text = nullable(formData.get('intro_text'));
  const body = nullable(formData.get('body'));
  const brand_color = nullable(formData.get('brand_color'));
  const accent_color = nullable(formData.get('accent_color'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('campuses')
    .insert({
      church_id: churchId,
      name,
      slug: slug || null,
      location,
      scheduling_location_id,
      is_active,
      hero_image_url,
      intro_text,
      body,
      brand_color,
      accent_color,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'campus.create',
    entity_type: 'campus',
    entity_id: data.id,
    metadata: { name },
  });

  revalidatePath('/settings/campuses');
  return { ok: true, id: data.id };
}

export async function updateCampus(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const location = nullable(formData.get('location'));
  const scheduling_location_id = nullable(formData.get('scheduling_location_id'));
  const is_active = formData.get('is_active') === 'on';
  const hero_image_url = nullable(formData.get('hero_image_url'));
  const intro_text = nullable(formData.get('intro_text'));
  const body = nullable(formData.get('body'));
  const brand_color = nullable(formData.get('brand_color'));
  const accent_color = nullable(formData.get('accent_color'));

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('campuses')
    .update({
      name,
      slug: slug || null,
      location,
      scheduling_location_id,
      is_active,
      hero_image_url,
      intro_text,
      body,
      brand_color,
      accent_color,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'campus.update',
    entity_type: 'campus',
    entity_id: id,
    metadata: { name, is_active },
  });

  revalidatePath('/settings/campuses');
  revalidatePath(`/settings/campuses/${id}`);
  return { ok: true, id };
}

export async function deleteCampus(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('campuses').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    action: 'campus.delete',
    entity_type: 'campus',
    entity_id: id,
  });
  revalidatePath('/settings/campuses');
  redirect('/settings/campuses');
}
