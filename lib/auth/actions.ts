'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
