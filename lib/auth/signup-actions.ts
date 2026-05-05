'use server';

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/log';

export interface SignupResult {
  ok: boolean;
  error?: string;
  /**
   * True when the user was signed in immediately (Supabase email
   * confirmation off). False when they need to verify via email.
   */
  hasSession?: boolean;
}

interface SignupArgs {
  churchId: string;
  campusId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/**
 * Public signup. Creates an auth user, a participant-role profile, and
 * a participants row scoped to the given church + campus. Profile and
 * participant rows are created via service-role because participant
 * profiles cannot self-write under existing RLS.
 *
 * Returns hasSession=true if the user is signed in (email confirmation
 * off); false if they need to verify their email first.
 */
export async function signUpParticipant(args: SignupArgs): Promise<SignupResult> {
  const firstName = args.firstName.trim();
  const lastName = args.lastName.trim();
  const email = args.email.trim().toLowerCase();
  const password = args.password;

  if (!firstName || !lastName) return { ok: false, error: 'Please enter your name.' };
  if (!email) return { ok: false, error: 'Email is required.' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (!args.churchId) return { ok: false, error: 'Missing church.' };

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();

  // Validate church (and campus if provided) is active. Service-role read
  // since the user has no session yet.
  const { data: church } = await admin
    .from('churches')
    .select('id, is_active')
    .eq('id', args.churchId)
    .maybeSingle();
  if (!church || !church.is_active) {
    return { ok: false, error: 'This church is not accepting signups right now.' };
  }
  if (args.campusId) {
    const { data: campus } = await admin
      .from('campuses')
      .select('id, church_id, is_active')
      .eq('id', args.campusId)
      .maybeSingle();
    if (!campus || !campus.is_active || campus.church_id !== args.churchId) {
      return { ok: false, error: 'This campus is not available.' };
    }
  }

  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
    },
  });

  if (signupError) {
    return { ok: false, error: signupError.message };
  }

  const user = signupData.user;
  if (!user) {
    return { ok: false, error: 'Sign-up did not return a user. Please try again.' };
  }

  // Create profile row (service-role: bypasses RLS).
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      role: 'participant',
      church_id: args.churchId,
      campus_id: args.campusId,
      is_platform_admin: false,
      first_name: firstName,
      last_name: lastName,
      email,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  // Create participants row, linked to this profile, scoped to church + campus.
  const { error: participantError } = await admin.from('participants').insert({
    church_id: args.churchId,
    campus_id: args.campusId,
    profile_id: user.id,
    first_name: firstName,
    last_name: lastName,
    email,
    status: 'new',
    signed_up_at: new Date().toISOString(),
  });

  if (participantError) {
    return { ok: false, error: participantError.message };
  }

  await recordAudit({
    action: 'participant.self_signup',
    entity_type: 'profile',
    entity_id: user.id,
    metadata: {
      church_id: args.churchId,
      campus_id: args.campusId,
      email,
    },
  });

  return {
    ok: true,
    hasSession: Boolean(signupData.session),
  };
}
