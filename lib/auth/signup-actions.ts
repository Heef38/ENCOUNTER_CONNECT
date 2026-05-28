'use server';

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/log';
import {
  initializeParticipantProgress,
  resolveDefaultFlowId,
} from '@/lib/flows/engine';

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
  /** Optional mobile number for text-message updates. */
  phone?: string;
  /** True when the user checked the SMS consent box. Only honored if a phone is given. */
  smsConsent?: boolean;
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
  const phone = args.phone?.trim() || null;

  if (!firstName || !lastName) return { ok: false, error: 'Please enter your name.' };
  if (!email) return { ok: false, error: 'Email is required.' };
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (!args.churchId) return { ok: false, error: 'Missing church.' };
  if (args.smsConsent && !phone) {
    return { ok: false, error: 'Enter your mobile number to receive text messages.' };
  }

  // Record SMS consent only when a number was given AND the box was checked.
  const smsConsentAt = phone && args.smsConsent ? new Date().toISOString() : null;

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
  const { data: participantRow, error: participantError } = await admin
    .from('participants')
    .insert({
      church_id: args.churchId,
      campus_id: args.campusId,
      profile_id: user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      status: 'new',
      signed_up_at: new Date().toISOString(),
      sms_consent_at: smsConsentAt,
      sms_consent_source: smsConsentAt ? 'web_signup' : null,
    })
    .select('id')
    .single();

  if (participantError || !participantRow) {
    return { ok: false, error: participantError?.message ?? 'Could not create participant.' };
  }

  // Enroll the participant in their default flow so their journey isn't
  // empty on first login. The campus default wins over the church-wide
  // default; absent either, the journey stays empty and staff can enroll
  // later. Best-effort: enrollment must never fail the signup itself.
  try {
    const flowId = await resolveDefaultFlowId(admin, args.churchId, args.campusId);
    if (flowId) {
      const init = await initializeParticipantProgress(admin, participantRow.id, flowId);
      if (init.success) {
        // Point the denormalized current_step_id at the first active step,
        // matching the convention completeStepAndAdvance maintains.
        const { data: firstStep } = await admin
          .from('flow_steps')
          .select('id')
          .eq('flow_id', flowId)
          .order('phase_index')
          .order('order_index')
          .limit(1)
          .maybeSingle();
        if (firstStep) {
          await admin
            .from('participants')
            .update({ current_step_id: firstStep.id })
            .eq('id', participantRow.id);
        }
        await recordAudit({
          action: 'participant.enrolled_in_flow',
          entity_type: 'participant',
          entity_id: participantRow.id,
          metadata: { flow_id: flowId, church_id: args.churchId, campus_id: args.campusId },
        });
      }
    }
  } catch {
    // Swallow — flow enrollment is recoverable by staff and must not
    // block account creation.
  }

  await recordAudit({
    action: 'participant.self_signup',
    entity_type: 'profile',
    entity_id: user.id,
    metadata: {
      church_id: args.churchId,
      campus_id: args.campusId,
      email,
      sms_consent: Boolean(smsConsentAt),
    },
  });

  return {
    ok: true,
    hasSession: Boolean(signupData.session),
  };
}
