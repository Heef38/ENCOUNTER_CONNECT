// Verifies Supabase auth email links (magic link sign-in, email confirm,
// recovery) server-side, then lands the user on their role-appropriate home.
//
// Supports both link shapes:
//  * `?token_hash=...&type=email` — the SSR-recommended template
//    (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`),
//    which works even when the link is opened in a different browser.
//  * `?code=...` — the default PKCE `{{ .ConfirmationURL }}` redirect, which
//    only works in the browser that requested the link.

import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { landingForSession } from '@/lib/auth/dal';
import type { Profile } from '@/lib/church/types';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  const supabase = await createServerSupabaseClient();

  let errorMessage: string | null = null;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    errorMessage = error?.message ?? null;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = 'Invalid sign-in link.';
  }

  if (errorMessage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    url.searchParams.set('auth_error', errorMessage);
    return NextResponse.redirect(url);
  }

  // Only allow same-origin relative paths from `next` to avoid open redirects.
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = '';
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let landing = '/';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    landing = await landingForSession({
      id: user.id,
      email: user.email ?? null,
      profile: (profile as Profile | null) ?? null,
    });
  }

  const url = request.nextUrl.clone();
  url.pathname = landing;
  url.search = '';
  return NextResponse.redirect(url);
}
