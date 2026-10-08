import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';
import {
  PUBLIC_CHURCH_COOKIE,
  publicChurchCookieOptions,
} from '@/lib/church/public-church-cookie';

// Paths that anonymous visitors are always allowed to reach.
const PUBLIC_PATHS = ['/', '/auth/callback', '/signup', '/privacy', '/terms'];

/** `/c/<slug>` and `/c/<slug>/<campus>` — the public per-church pages. */
const CHURCH_SLUG_PATH = /^\/c\/([^/]+)/;

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSession(request);
  const path = request.nextUrl.pathname;

  const isPublic =
    PUBLIC_PATHS.includes(path) ||
    path.startsWith('/_next') ||
    path.startsWith('/auth') ||
    path.startsWith('/c/');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Remember which church a visitor came in through, so the hub at `/` can
  // show that church's public events on a later visit. Set here rather than in
  // the page because Server Components can't write cookies. This is a display
  // hint only — never a permission — and the hub still resolves the signed-in
  // user's church from profiles.church_id when there is a session.
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
  // Run on all paths except static assets, image optimization, and API routes.
  // API routes enforce auth per-handler; running proxy on them would block
  // server actions tied to auth itself.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
