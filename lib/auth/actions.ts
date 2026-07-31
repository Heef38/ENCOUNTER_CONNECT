'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { landingForSession } from '@/lib/auth/dal';
import type { Profile } from '@/lib/church/types';

export interface SignInState {
  error?: string;
}

export async function signInAction(
  _prev: SignInState | undefined,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message ?? 'Unable to sign in.' };
  }

  // Determine landing path: pure profile lookup wouldn't see connector
  // membership, so route through landingForSession which factors in
  // connectors row + multi-platform users → /landing picker.
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  revalidatePath('/', 'layout');
  redirect(
    await landingForSession({
      id: data.user.id,
      email: data.user.email ?? null,
      profile: (profile as Profile | null) ?? null,
    }),
  );
}

export interface MagicLinkState {
  error?: string;
  sent?: boolean;
}

export async function sendMagicLinkAction(
  _prev: MagicLinkState | undefined,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    return { error: 'Email is required.' };
  }

  const headerList = await headers();
  const origin =
    headerList.get('origin') ??
    `https://${headerList.get('host') ?? 'encounter-connect.app'}`;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Existing accounts only — new people go through /signup so they get
      // a church, profile, and journey. A link for an unknown email would
      // create an orphan auth user with no profile row.
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    // Supabase reports unknown emails as a signup-disabled error when
    // shouldCreateUser is false. Don't leak which emails exist.
    if (/signup/i.test(error.message)) {
      return { sent: true };
    }
    return { error: error.message };
  }

  return { sent: true };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
