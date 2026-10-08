import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession, type SessionUser } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Gate for the /api/scheduling/* JSON endpoints (outside the proxy
 * matcher). They used to answer anyone, signed in or not, with every
 * church's connector names, emails, phones and free slots.
 *
 * Returns the caller's own RLS client: migration 031 scopes resources and
 * appointment types to the caller's church, so reading through it is what
 * keeps one church's calendars out of another's hands.
 */
export async function requireSchedulingStaff(): Promise<
  { ok: true; session: SessionUser; supabase: SupabaseClient } | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  }
  const role = session.profile?.role ?? 'participant';
  const staff = Boolean(session.profile?.is_platform_admin) || role !== 'participant';
  if (!staff) {
    return { ok: false, response: NextResponse.json({ error: 'Not allowed.' }, { status: 403 }) };
  }
  return { ok: true, session, supabase: await createServerSupabaseClient() };
}
