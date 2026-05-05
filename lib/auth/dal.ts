import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/church/types';

export interface SessionUser {
  id: string;
  email: string | null;
  profile: Profile | null;
}

/**
 * Returns the currently signed-in user + their EC profile, or null.
 * Memoized for the duration of a single server render.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
  };
});

/**
 * Redirects to `/` if not authenticated. Returns the authenticated session.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/');
  return session;
}

/**
 * Redirects participants away from staff areas. Returns the session for staff.
 * Platform admins pass regardless of church_id.
 */
export async function requireStaff(): Promise<SessionUser> {
  const session = await requireAuth();
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const isStaff = isPlatform || (role && role !== 'participant');
  if (!isStaff) redirect('/journey');
  return session;
}

/**
 * Requires platform_admin (operator of Encounter Connect itself).
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  if (!session.profile?.is_platform_admin) redirect('/dashboard');
  return session;
}

/**
 * Requires church_admin or platform_admin.
 */
export async function requireChurchAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  if (!isPlatform && role !== 'church_admin') redirect('/dashboard');
  return session;
}

/**
 * Requires campus_admin, church_admin, or platform_admin.
 */
export async function requireCampusAdmin(): Promise<SessionUser> {
  const session = await requireAuth();
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  if (!isPlatform && role !== 'church_admin' && role !== 'campus_admin') {
    redirect('/dashboard');
  }
  return session;
}

/**
 * Computes the post-login landing URL for a given profile.
 * Platform admins land on /dashboard; staff on /dashboard; participants on /journey.
 *
 * NOTE: This intentionally ignores connector membership — call sites that
 * want to honor the role picker should use `landingForSession()` instead.
 */
export function landingPathForProfile(profile: Profile | null): string {
  if (!profile) return '/journey';
  if (profile.is_platform_admin) return '/dashboard';
  return profile.role === 'participant' ? '/journey' : '/dashboard';
}

export type AvailablePlatform = 'platform' | 'admin' | 'connector' | 'participant';

export interface PlatformOption {
  key: AvailablePlatform;
  label: string;
  description: string;
  href: string;
}

/**
 * Returns every platform a session is eligible for. Used to decide
 * whether to show the role-picker landing page (2+) or jump straight
 * into the only available home (1).
 */
export async function getAvailablePlatforms(
  session: SessionUser,
): Promise<PlatformOption[]> {
  const out: PlatformOption[] = [];
  const role = session.profile?.role;

  if (session.profile?.is_platform_admin) {
    out.push({
      key: 'platform',
      label: 'Platform admin',
      description: 'Manage churches across the entire Encounter Connect platform.',
      href: '/platform/churches',
    });
  }

  if (role === 'church_admin' || role === 'campus_admin') {
    out.push({
      key: 'admin',
      label: 'Church admin',
      description: 'People, flows, settings, audit log — the full church dashboard.',
      href: '/dashboard',
    });
  }

  // Connector membership is determined by an active connectors row tied
  // to this profile, regardless of the profile.role enum.
  const supabase = await createServerSupabaseClient();
  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id')
    .eq('profile_id', session.id)
    .eq('is_active', true)
    .maybeSingle();
  if (connectorRow) {
    out.push({
      key: 'connector',
      label: 'Connector',
      description: 'Walk participants through their journey one-on-one.',
      href: '/connector',
    });
  }

  if (role === 'participant') {
    out.push({
      key: 'participant',
      label: 'My journey',
      description: 'Continue where you left off in your connection journey.',
      href: '/journey',
    });
  }

  return out;
}

/**
 * Resolves where a session should land after login. Picks the highest-
 * privilege available platform directly — the role-grouped nav lets the
 * user jump between platforms from there, so no picker page is needed.
 *
 * Order of preference: platform > admin > connector > participant.
 */
export async function landingForSession(session: SessionUser): Promise<string> {
  const platforms = await getAvailablePlatforms(session);
  if (platforms.length === 0) return '/journey';
  const order: AvailablePlatform[] = ['admin', 'platform', 'connector', 'participant'];
  for (const key of order) {
    const found = platforms.find((p) => p.key === key);
    if (found) return found.href;
  }
  return platforms[0].href;
}

/**
 * Requires that the user has an active connector record. Used to gate
 * the connector platform pages.
 */
export async function requireConnector(): Promise<{
  session: SessionUser;
  connectorId: string;
}> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: connector } = await supabase
    .from('connectors')
    .select('id')
    .eq('profile_id', session.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!connector) redirect('/');
  return { session, connectorId: (connector as { id: string }).id };
}
