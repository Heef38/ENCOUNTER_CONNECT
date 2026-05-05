import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Enums ─────────────────────────────────────────────────────

export type ECUserRole =
  | 'church_admin'
  | 'campus_admin'
  | 'connector'
  | 'participant';

// ── Church ────────────────────────────────────────────────────

export interface Church {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
  is_active: boolean;
  logo_url: string | null;
  brand_color: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateChurchInput {
  name: string;
  slug?: string;
  timezone?: string;
  logo_url?: string;
  brand_color?: string;
  description?: string;
}

export interface UpdateChurchInput {
  name?: string;
  slug?: string;
  timezone?: string;
  is_active?: boolean;
  logo_url?: string;
  brand_color?: string;
  description?: string;
}

// ── Campus ────────────────────────────────────────────────────

export interface Campus {
  id: string;
  church_id: string;
  name: string;
  slug: string | null;
  location: string | null;
  scheduling_location_id: string | null;
  is_active: boolean;
  hero_image_url: string | null;
  intro_text: string | null;
  body: string | null;
  brand_color: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCampusInput {
  church_id: string;
  name: string;
  location?: string;
  scheduling_location_id?: string;
}

export interface UpdateCampusInput {
  name?: string;
  location?: string;
  scheduling_location_id?: string;
  is_active?: boolean;
}

// ── Profile ───────────────────────────────────────────────────

export interface Profile {
  id: string;
  role: ECUserRole;
  church_id: string | null;
  campus_id: string | null;
  is_platform_admin: boolean;
  first_name: string;
  last_name: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileWithCampus extends Profile {
  campus: Pick<Campus, 'id' | 'name'> | null;
}

export interface CreateProfileInput {
  id: string; // must match auth.users id
  role?: ECUserRole;
  church_id?: string;
  campus_id?: string;
  is_platform_admin?: boolean;
  first_name: string;
  last_name: string;
  email?: string;
}

export interface UpdateProfileInput {
  role?: ECUserRole;
  church_id?: string;
  campus_id?: string;
  is_platform_admin?: boolean;
  first_name?: string;
  last_name?: string;
  email?: string;
}
