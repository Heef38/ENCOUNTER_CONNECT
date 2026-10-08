'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { geocodeAddress } from '@/lib/geo/geocode';

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

function coordinate(raw: FormDataEntryValue | null, limit: number): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && Math.abs(n) <= limit ? Math.round(n * 1e6) / 1e6 : null;
}

/**
 * The campus's address and pin. Typed coordinates win; otherwise the
 * address is looked up (a church building is public). An unchanged address
 * keeps its existing pin.
 */
async function placeFields(formData: FormData, existing?: { address_line1: string | null; city: string | null; region: string | null; postal_code: string | null; lat: number | null; lng: number | null }) {
  const address_line1 = nullable(formData.get('address_line1'));
  const city = nullable(formData.get('city'));
  const region = nullable(formData.get('region'));
  const postal_code = nullable(formData.get('postal_code'));
  const typedLat = coordinate(formData.get('lat'), 90);
  const typedLng = coordinate(formData.get('lng'), 180);

  let lat: number | null = null;
  let lng: number | null = null;
  let geocoded_at: string | null = null;
  const addressChanged =
    !existing ||
    existing.address_line1 !== address_line1 ||
    existing.city !== city ||
    existing.region !== region ||
    existing.postal_code !== postal_code;

  if (typedLat !== null && typedLng !== null) {
    lat = typedLat;
    lng = typedLng;
  } else if (!addressChanged && existing?.lat != null && existing?.lng != null) {
    lat = existing.lat;
    lng = existing.lng;
  } else if (address_line1 || city || postal_code) {
    const pin = await geocodeAddress({ line1: address_line1, city, region, postalCode: postal_code });
    if (pin) {
      lat = pin.lat;
      lng = pin.lng;
      geocoded_at = new Date().toISOString();
    }
  }
  return { address_line1, city, region, postal_code, lat, lng, ...(geocoded_at ? { geocoded_at } : {}) };
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
      ...(await placeFields(formData)),
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
  const { data: before } = await supabase
    .from('campuses')
    .select('address_line1, city, region, postal_code, lat, lng')
    .eq('id', id)
    .maybeSingle();
  const { data: saved, error } = await supabase
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
      ...(await placeFields(formData, before ?? undefined)),
    })
    .eq('id', id)
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!saved || saved.length === 0) {
    return { ok: false, error: 'Only a church admin can change campus details.' };
  }

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
