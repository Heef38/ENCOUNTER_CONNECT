import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult } from '@/lib/scheduling/types';
import type {
  Campus,
  Profile,
  ProfileWithCampus,
  CreateCampusInput,
  UpdateCampusInput,
  CreateProfileInput,
  UpdateProfileInput,
} from './types';

// ── Campuses ──────────────────────────────────────────────────

export async function listCampuses(
  supabase: SupabaseClient,
  includeInactive = false,
): Promise<ServiceResult<Campus[]>> {
  let q = supabase.from('campuses').select('*').order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Campus[] };
}

export async function getCampus(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<Campus>> {
  const { data, error } = await supabase
    .from('campuses')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Campus };
}

export async function createCampus(
  supabase: SupabaseClient,
  input: CreateCampusInput,
): Promise<ServiceResult<Campus>> {
  if (!input.name?.trim()) {
    return { success: false, error: 'Campus name is required.' };
  }
  const { data, error } = await supabase
    .from('campuses')
    .insert({
      name: input.name.trim(),
      location: input.location ?? null,
      scheduling_location_id: input.scheduling_location_id ?? null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Campus };
}

export async function updateCampus(
  supabase: SupabaseClient,
  id: string,
  input: UpdateCampusInput,
): Promise<ServiceResult<Campus>> {
  const { data, error } = await supabase
    .from('campuses')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Campus };
}

// ── Profiles ─────────────────────────────────────────────────

export async function getProfile(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<ProfileWithCampus>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, campus:campuses(id, name)')
    .eq('id', id)
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as ProfileWithCampus };
}

export async function upsertProfile(
  supabase: SupabaseClient,
  input: CreateProfileInput,
): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({
      id: input.id,
      role: input.role ?? 'participant',
      campus_id: input.campus_id ?? null,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email ?? null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Profile };
}

export async function updateProfile(
  supabase: SupabaseClient,
  id: string,
  input: UpdateProfileInput,
): Promise<ServiceResult<Profile>> {
  const { data, error } = await supabase
    .from('profiles')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Profile };
}
