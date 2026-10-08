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
 * Requires platform_admin (operator of ChurchConnect itself).
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
 * Resolves where a session should land after login. Picks the highest-
 * privilege available platform directly — the role-grouped nav lets the
 * user jump between platforms from there, so no picker page is needed.
 *
 * Order of preference: platform > admin > connector > participant.
 */
export async function landingForSession(session: SessionUser): Promise<string> {
  // The connection hub at `/` is now home for every role — it's the one page
  // that's useful to all of them, and the nav still carries each role's own
  // home. Kept async and session-taking so call sites (login action, magic-link
  // confirm route) don't change, and so a future per-church or per-role landing
  // preference has somewhere to live.
  void session;
  return '/';
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
