import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';
import {
  PUBLIC_CHURCH_COOKIE,
  publicChurchCookieOptions,
} from '@/lib/church/public-church-cookie';

// Paths that anonymous visitors are always allowed to reach.
const PUBLIC_PATHS = ['/', '/auth/callback', '/signup', '/privacy', '/terms', '/church-agreement', '/robots.txt', '/sitemap.xml'];

// Path prefixes that anonymous visitors may reach. A page under one of these
// still decides for itself what an anonymous visitor sees: /hub/e/<id> shows
// public gatherings only, and /hub/e/<id>/edit requires a session.
const PUBLIC_PREFIXES = ['/_next', '/auth', '/c/', '/hub/e/', '/invite/'];

/** `/c/<slug>` and `/c/<slug>/<campus>` — the public per-church pages. */
const CHURCH_SLUG_PATH = /^\/c\/([^/]+)/;

/**
 * SchedulingCore's own screens run on the service role with no checks of
 * their own (code under /app/scheduling is kept untouched), so the proxy is
 * their gate: church admins, campus admins and platform admins only.
 * Connectors manage availability at /connector/availability; participants
 * book through their journey.
 */
async function canUseSchedulingCore(
  supabase: Awaited<ReturnType<typeof refreshSession>>['supabase'],
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('role, is_platform_admin')
    .eq('id', userId)
    .maybeSingle();
  const p = data as { role: string; is_platform_admin: boolean } | null;
  return Boolean(p && (p.is_platform_admin || p.role === 'church_admin' || p.role === 'campus_admin'));
}

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await refreshSession(request);
  const path = request.nextUrl.pathname;

  const isPublic =
    PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && (path === '/scheduling' || path.startsWith('/scheduling/'))) {
    if (!(await canUseSchedulingCore(supabase, user.id))) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Remember which church a visitor came in through, so the hub at `/` can
  // show that church's public gatherings on a later visit. Set here rather
  // than in the page because Server Components can't write cookies. A
  // display hint only — never a permission — and the hub still resolves the
  // signed-in user's church from profiles.church_id when there is a session.
  const churchMatch = CHURCH_SLUG_PATH.exec(path);
  if (churchMatch) {
    const slug = decodeURIComponent(churchMatch[1]);
    if (request.cookies.get(PUBLIC_CHURCH_COOKIE)?.value !== slug) {
      response.cookies.set(PUBLIC_CHURCH_COOKIE, slug, publicChurchCookieOptions);
    }
  }

  return response;
}

export const config = {
  // Run on all paths except static assets, image optimization, and API
  // routes. API routes check the session themselves (see
  // lib/scheduling-api/guard.ts for the scheduling endpoints).
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
