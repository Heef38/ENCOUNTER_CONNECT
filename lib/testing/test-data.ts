'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { createFlow, createFlowStep } from '@/lib/flows/services';
import { initializeParticipantProgress } from '@/lib/flows/engine';
import {
  TEST_CHURCH_SLUG,
  TEST_CAMPUS_SLUG,
  TEST_EMAIL_DOMAIN,
  TEST_PASSWORD,
  TEST_USERS,
} from './test-users';

export interface TestChurchStatus {
  exists: boolean;
  churchId: string | null;
  userCounts: {
    churchAdmins: number;
    campusAdmins: number;
    connectors: number;
    participants: number;
  };
  users: Array<{
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  }>;
}

export async function getTestChurchStatus(): Promise<TestChurchStatus> {
  await requirePlatformAdmin();
  const admin = await createServiceRoleClient();

  const { data: church } = await admin
    .from('churches')
    .select('id')
    .eq('slug', TEST_CHURCH_SLUG)
    .maybeSingle();

  const empty: TestChurchStatus = {
    exists: false,
    churchId: null,
    userCounts: { churchAdmins: 0, campusAdmins: 0, connectors: 0, participants: 0 },
    users: [],
  };
  if (!church) return empty;

  const { data: profiles } = await admin
    .from('profiles')
    .select('email, role, first_name, last_name')
    .eq('church_id', (church as { id: string }).id);

  const users = (profiles ?? []).map((p) => ({
    email: (p as { email: string | null }).email ?? '',
    role: (p as { role: string }).role,
    firstName: (p as { first_name: string }).first_name,
    lastName: (p as { last_name: string }).last_name,
  }));

  return {
    exists: true,
    churchId: (church as { id: string }).id,
    userCounts: {
      churchAdmins: users.filter((u) => u.role === 'church_admin').length,
      campusAdmins: users.filter((u) => u.role === 'campus_admin').length,
      connectors:   users.filter((u) => u.role === 'connector').length,
      participants: users.filter((u) => u.role === 'participant').length,
    },
    users,
  };
}

export interface SeedResult {
  ok: boolean;
  error?: string;
  summary?: {
    churchId: string;
    campusId: string;
    flowId: string;
    userCount: number;
  };
}

export async function seedTestChurch(): Promise<SeedResult> {
  await requirePlatformAdmin();
  const admin = await createServiceRoleClient();

  // Idempotency: refuse to seed twice. User must wipe first to get a clean
  // slate — otherwise we'd leave half-merged duplicates.
  const { data: existing } = await admin
    .from('churches')
    .select('id')
    .eq('slug', TEST_CHURCH_SLUG)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      error: 'Test church already exists. Wipe it first to re-seed.',
    };
  }

  // 1. Church + campus
  const { data: church, error: churchErr } = await admin
    .from('churches')
    .insert({
      name: 'Test Church',
      slug: TEST_CHURCH_SLUG,
      timezone: 'America/Chicago',
      is_active: true,
      description: 'Sandbox tenant for end-to-end testing. Safe to wipe.',
    })
    .select('id')
    .single();
  if (churchErr || !church) {
    return { ok: false, error: `Church insert: ${churchErr?.message ?? 'unknown'}` };
  }
  const churchId = (church as { id: string }).id;

  const { data: campus, error: campusErr } = await admin
    .from('campuses')
    .insert({
      church_id: churchId,
      name: 'Test Campus',
      slug: TEST_CAMPUS_SLUG,
      is_active: true,
    })
    .select('id')
    .single();
  if (campusErr || !campus) {
    return { ok: false, error: `Campus insert: ${campusErr?.message ?? 'unknown'}` };
  }
  const campusId = (campus as { id: string }).id;

  // 2. Auth users + profiles
  const profileIdByKey = new Map<string, string>();
  for (const spec of TEST_USERS) {
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: spec.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: spec.firstName, last_name: spec.lastName },
    });
    if (authErr || !created.user) {
      return {
        ok: false,
        error: `Auth user ${spec.email}: ${authErr?.message ?? 'no user returned'}`,
      };
    }
    const userId = created.user.id;
    profileIdByKey.set(spec.key, userId);

    const { error: profErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        role: spec.role,
        church_id: churchId,
        campus_id: campusId,
        is_platform_admin: false,
        first_name: spec.firstName,
        last_name: spec.lastName,
        email: spec.email,
      },
      { onConflict: 'id' },
    );
    if (profErr) {
      return { ok: false, error: `Profile ${spec.email}: ${profErr.message}` };
    }
  }

  // 3. Connectors rows for connector users
  for (const spec of TEST_USERS.filter((u) => u.isConnector)) {
    const profileId = profileIdByKey.get(spec.key)!;
    const { error: connErr } = await admin.from('connectors').insert({
      church_id: churchId,
      profile_id: profileId,
      campus_id: campusId,
      is_active: true,
    });
    if (connErr) {
      return { ok: false, error: `Connector ${spec.email}: ${connErr.message}` };
    }
  }

  // 4. Participants rows
  const participantIdByKey = new Map<string, string>();
  for (const spec of TEST_USERS.filter((u) => u.isParticipant)) {
    const profileId = profileIdByKey.get(spec.key)!;
    const { data: pRow, error: pErr } = await admin
      .from('participants')
      .insert({
        church_id: churchId,
        campus_id: campusId,
        profile_id: profileId,
        first_name: spec.firstName,
        last_name: spec.lastName,
        email: spec.email,
        status: 'new',
        signed_up_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (pErr || !pRow) {
      return { ok: false, error: `Participant ${spec.email}: ${pErr?.message ?? 'unknown'}` };
    }
    participantIdByKey.set(spec.key, (pRow as { id: string }).id);
  }

  // 5. Flow + steps. Mirrors seedEncounterConnectFlow but called as platform
  // admin against the test tenant explicitly.
  const { data: apptType } = await admin
    .from('scheduling_appointment_types')
    .select('id')
    .eq('is_active', true)
    .ilike('name', '%connect%')
    .limit(1)
    .maybeSingle();
  const apptTypeId = (apptType as { id: string } | null)?.id;

  const flowResult = await createFlow(admin, {
    name: 'Test Journey',
    description: 'Seeded by the test-data harness.',
    is_default: true,
    church_id: churchId,
  });
  if (!flowResult.success) {
    return { ok: false, error: `Flow: ${flowResult.error}` };
  }
  const flowId = flowResult.data.id;

  const stepInputs: Array<Parameters<typeof createFlowStep>[1]> = [
    {
      flow_id: flowId,
      title: 'Watch the welcome videos',
      description: 'A short series introducing the church.',
      step_type: 'video',
      order_index: 0,
      trigger_kind: 'signup',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flowId,
      title: 'Personal Assessment',
      description: 'Tell us about yourself.',
      step_type: 'assessment',
      assessment_kind: 'personal',
      order_index: 1,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flowId,
      title: 'Connect with God Assessment',
      description: 'Reflect on your spiritual journey.',
      step_type: 'assessment',
      assessment_kind: 'connect_with_god',
      order_index: 2,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flowId,
      title: 'Spiritual Gifts Assessment',
      description: "Discover how you're wired to serve.",
      step_type: 'assessment',
      assessment_kind: 'spiritual_gifts',
      order_index: 3,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flowId,
      title: 'Schedule your first meeting',
      description: 'Pick a time to meet with a connector.',
      step_type: 'schedule',
      appointment_type_id: apptTypeId,
      order_index: 4,
      trigger_kind: 'previous_complete',
      output_kind: 'auto_match_connector',
      is_required: true,
    },
  ];
  for (const step of stepInputs) {
    const r = await createFlowStep(admin, step);
    if (!r.success) return { ok: false, error: `Step "${step.title}": ${r.error}` };
  }

  // 6. Initialize journey progress for mid + done participants
  const midId = participantIdByKey.get('participant_mid');
  const doneId = participantIdByKey.get('participant_done');

  if (midId) {
    const r = await initializeParticipantProgress(admin, midId, flowId);
    if (!r.success) {
      return { ok: false, error: `Mid progress: ${r.error}` };
    }
    await admin
      .from('participants')
      .update({ status: 'in_progress' })
      .eq('id', midId);
  }
  if (doneId) {
    const r = await initializeParticipantProgress(admin, doneId, flowId);
    if (!r.success) {
      return { ok: false, error: `Done progress: ${r.error}` };
    }
    await admin
      .from('participant_progress')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('participant_id', doneId);
    await admin
      .from('participants')
      .update({ status: 'completed' })
      .eq('id', doneId);
  }

  await recordAudit({
    action: 'test_data.seed',
    entity_type: 'church',
    entity_id: churchId,
    metadata: { user_count: TEST_USERS.length, flow_id: flowId },
  });

  revalidatePath('/platform/test-data');
  return {
    ok: true,
    summary: {
      churchId,
      campusId,
      flowId,
      userCount: TEST_USERS.length,
    },
  };
}

export interface WipeResult {
  ok: boolean;
  error?: string;
  removed?: {
    authUsers: number;
    churchDeleted: boolean;
  };
}

/**
 * Hard-deletes the test church and every auth user whose email lives on
 * the test domain. The church FK cascade handles campuses, connectors,
 * participants, flows, etc. Auth user deletes cascade through profiles.
 *
 * We delete auth users first so orphans (auth user created but profile
 * insert failed during seed) get cleaned up too.
 */
export async function wipeTestChurch(): Promise<WipeResult> {
  await requirePlatformAdmin();
  const admin = await createServiceRoleClient();

  const { data: usersList, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    return { ok: false, error: `List users: ${listErr.message}` };
  }
  const testAuthUsers = (usersList?.users ?? []).filter((u) =>
    (u.email ?? '').endsWith(`@${TEST_EMAIL_DOMAIN}`),
  );

  let deletedAuthCount = 0;
  for (const u of testAuthUsers) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) {
      return { ok: false, error: `Delete auth user ${u.email}: ${error.message}` };
    }
    deletedAuthCount++;
  }

  const { data: church } = await admin
    .from('churches')
    .select('id')
    .eq('slug', TEST_CHURCH_SLUG)
    .maybeSingle();

  let churchDeleted = false;
  if (church) {
    const { error: delErr } = await admin
      .from('churches')
      .delete()
      .eq('id', (church as { id: string }).id);
    if (delErr) {
      return { ok: false, error: `Delete church: ${delErr.message}` };
    }
    churchDeleted = true;
  }

  await recordAudit({
    action: 'test_data.wipe',
    entity_type: 'church',
    metadata: { auth_users_removed: deletedAuthCount, church_deleted: churchDeleted },
  });

  revalidatePath('/platform/test-data');
  return {
    ok: true,
    removed: { authUsers: deletedAuthCount, churchDeleted },
  };
}
