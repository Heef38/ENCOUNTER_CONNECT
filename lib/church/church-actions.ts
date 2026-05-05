'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/dal';
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

export async function createChurch(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const timezoneRaw = nullable(formData.get('timezone'));
  const timezone = timezoneRaw ?? 'America/Chicago';
  const description = nullable(formData.get('description'));
  const logo_url = nullable(formData.get('logo_url'));
  const brand_color = nullable(formData.get('brand_color'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('churches')
    .insert({
      name,
      slug: slug || null,
      timezone,
      description,
      logo_url,
      brand_color,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'church.create',
    entity_type: 'church',
    entity_id: data.id,
    metadata: { name, slug, timezone },
  });

  revalidatePath('/platform/churches');
  return { ok: true, id: data.id };
}

export async function updateChurch(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requirePlatformAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const slugRaw = String(formData.get('slug') ?? '').trim();
  const slug = slugRaw ? slugify(slugRaw) : slugify(name);
  const timezoneRaw = nullable(formData.get('timezone'));
  const timezone = timezoneRaw ?? 'America/Chicago';
  const description = nullable(formData.get('description'));
  const logo_url = nullable(formData.get('logo_url'));
  const brand_color = nullable(formData.get('brand_color'));
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('churches')
    .update({
      name,
      slug: slug || null,
      timezone,
      description,
      logo_url,
      brand_color,
      is_active,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'church.update',
    entity_type: 'church',
    entity_id: id,
    metadata: { name, slug, is_active },
  });

  revalidatePath('/platform/churches');
  revalidatePath(`/platform/churches/${id}`);
  return { ok: true, id };
}

/**
 * Soft delete: marks church inactive. We never hard-delete because the FK
 * cascade would wipe campuses, profiles, participants, flows, etc.
 */
export async function deactivateChurch(id: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('churches')
    .update({ is_active: false })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'church.deactivate',
    entity_type: 'church',
    entity_id: id,
  });

  revalidatePath('/platform/churches');
  redirect('/platform/churches');
}
