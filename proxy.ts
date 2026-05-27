import { NextResponse, type NextRequest } from 'next/server';
import { refreshSession } from '@/lib/supabase/proxy';

// Paths that anonymous visitors are always allowed to reach.
const PUBLIC_PATHS = ['/', '/auth/callback', '/signup', '/privacy', '/terms'];

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
