'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { createFlow, createFlowStep } from '@/lib/flows/services';
import { initializeParticipantProgress } from '@/lib/flows/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEST_CHURCH_SLUG,
  TEST_CAMPUS_SLUG,
  TEST_CHURCH_2_SLUG,
  TEST_CAMPUS_2_SLUG,
  TEST_EMAIL_DOMAIN,
  TEST_PASSWORD_ENV,
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
  const testPassword = process.env[TEST_PASSWORD_ENV] ?? '';
  if (testPassword.length < 12) {
    return {
      ok: false,
      error: `Set ${TEST_PASSWORD_ENV} (12+ characters) in the environment before seeding. Test accounts live in the production database, so their password is never hardcoded.`,
    };
  }
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
      is_test: true,
      connect_name: 'Test Connect',
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
      // A real-looking place so the map has a pin. Never a home.
      city: 'Midland',
      region: 'TX',
      lat: 31.9973,
      lng: -102.0779,
      geocoded_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (campusErr || !campus) {
    return { ok: false, error: `Campus insert: ${campusErr?.message ?? 'unknown'}` };
  }
  const campusId = (campus as { id: string }).id;

  // 1b. A second test church, a handshake-and-a-conversation church with no
  //     journey, to rehearse that two churches never see each other.
  const second = await seedSecondTenant(admin);
  if ('error' in second) return { ok: false, error: second.error };
  const tenantOf = (spec: (typeof TEST_USERS)[number]) =>
    spec.tenant === 'second' ? { churchId: second.churchId, campusId: second.campusId } : { churchId, campusId };

  // 2. Auth users + profiles
  const profileIdByKey = new Map<string, string>();
  for (const spec of TEST_USERS) {
    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: spec.email,
      password: testPassword,
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
        church_id: tenantOf(spec).churchId,
        campus_id: tenantOf(spec).campusId,
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
  const confirmer = profileIdByKey.get('church_admin') ?? null;
  for (const spec of TEST_USERS.filter((u) => u.isParticipant)) {
    const profileId = profileIdByKey.get(spec.key)!;
    const signedUp =
      spec.key === 'participant_new'
        ? new Date(Date.now() - 9 * 864e5) // past the 7-day window: shows as "not contacted yet"
        : new Date(Date.now() - 20 * 864e5);
    const { data: pRow, error: pErr } = await admin
      .from('participants')
      .insert({
        church_id: tenantOf(spec).churchId,
        campus_id: tenantOf(spec).campusId,
        profile_id: profileId,
        first_name: spec.firstName,
        last_name: spec.lastName,
        email: spec.email,
        status: spec.membership === 'member' ? 'connected' : 'new',
        signed_up_at: signedUp.toISOString(),
        joined_as: spec.membership ? 'member' : 'guest',
        member_confirmed_at: spec.membership === 'member' ? new Date().toISOString() : null,
        member_confirmed_by: spec.membership === 'member' && spec.tenant !== 'second' ? confirmer : null,
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

  // 7. A living church: groups, gatherings and contact history, so This
  //    week, the map, the digest and the nudges all have something real.
  const living = await seedLivingData(admin, {
    churchId,
    campusId,
    profileIdByKey,
    participantIdByKey,
    secondChurchId: second.churchId,
    secondCampusId: second.campusId,
  });
  if (living) return { ok: false, error: living };

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

  const { data: churches } = await admin
    .from('churches')
    .select('id')
    .in('slug', [TEST_CHURCH_SLUG, TEST_CHURCH_2_SLUG]);

  let churchDeleted = false;
  for (const church of (churches ?? []) as Array<{ id: string }>) {
    const { error: delErr } = await admin.from('churches').delete().eq('id', church.id);
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

async function seedSecondTenant(admin: SupabaseClient): Promise<{ churchId: string; campusId: string } | { error: string }> {
  const { data: church, error } = await admin
    .from('churches')
    .insert({
      name: 'Test Church Two',
      slug: TEST_CHURCH_2_SLUG,
      timezone: 'America/Chicago',
      is_active: true,
      is_test: true,
      description: 'Second sandbox tenant. Safe to wipe.',
    })
    .select('id')
    .single();
  if (error || !church) return { error: `Second church: ${error?.message ?? 'unknown'}` };
  const churchId = (church as { id: string }).id;
  const { data: campus, error: campusErr } = await admin
    .from('campuses')
    .insert({
      church_id: churchId,
      name: 'Test Two Campus',
      slug: TEST_CAMPUS_2_SLUG,
      is_active: true,
      city: 'Loop',
      region: 'TX',
      lat: 32.9165,
      lng: -101.9549,
      geocoded_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (campusErr || !campus) return { error: `Second campus: ${campusErr?.message ?? 'unknown'}` };
  await admin.from('church_settings').update({ journey_mode: 'none' }).eq('church_id', churchId);
  return { churchId, campusId: (campus as { id: string }).id };
}

async function eventTypeId(admin: SupabaseClient, churchId: string, name: string): Promise<string | null> {
  const { data } = await admin
    .from('event_types')
    .select('id, name')
    .eq('church_id', churchId)
    .order('order_index');
  const types = (data ?? []) as Array<{ id: string; name: string }>;
  return (types.find((t) => t.name.toLowerCase().includes(name)) ?? types[0])?.id ?? null;
}

/** Days from now at a local evening hour, as a UTC instant (Central time). */
function evening(daysAhead: number, hourLocal = 19): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hourLocal + 5, 0, 0, 0);
  return d;
}

async function seedLivingData(
  admin: SupabaseClient,
  ctx: {
    churchId: string;
    campusId: string;
    profileIdByKey: Map<string, string>;
    participantIdByKey: Map<string, string>;
    secondChurchId: string;
    secondCampusId: string;
  },
): Promise<string | null> {
  const pid = (k: string) => ctx.profileIdByKey.get(k) ?? null;

  // Groups: a home group, a serve team, and a youth roster.
  const { data: groups, error: gErr } = await admin
    .from('groups')
    .insert([
      { church_id: ctx.churchId, campus_id: ctx.campusId, name: 'Tuesday Home Group', kind: 'home_group', leader_profile_id: pid('member') },
      { church_id: ctx.churchId, campus_id: ctx.campusId, name: 'Hospitality Team', kind: 'serve' },
      { church_id: ctx.churchId, campus_id: ctx.campusId, name: 'Students', kind: 'age_stage', is_youth: true, is_private: true },
    ])
    .select('id, name');
  if (gErr || !groups) return `Groups: ${gErr?.message ?? 'unknown'}`;
  const gid = (name: string) => (groups as Array<{ id: string; name: string }>).find((g) => g.name === name)!.id;
  const members = [
    { group_id: gid('Tuesday Home Group'), profile_id: pid('member'), role: 'leader' },
    { group_id: gid('Tuesday Home Group'), profile_id: pid('participant_done'), role: 'member' },
    { group_id: gid('Hospitality Team'), profile_id: pid('participant_done'), role: 'member' },
  ].filter((m) => m.profile_id);
  const { error: gmErr } = await admin.from('group_members').insert(members);
  if (gmErr) return `Group members: ${gmErr.message}`;

  // Gatherings: a public prayer night at church, a private home group at a
  // home (address held until people reply), and one at the other church.
  const prayerType = await eventTypeId(admin, ctx.churchId, 'prayer');
  const homeType = await eventTypeId(admin, ctx.churchId, 'home');
  const otherType = await eventTypeId(admin, ctx.secondChurchId, 'prayer');
  if (!prayerType || !homeType || !otherType) return 'Event types were not seeded for the test churches.';
  const now = new Date().toISOString();
  const prayerStart = evening(3);
  const homeStart = evening(5);
  const otherStart = evening(4);
  const { data: events, error: eErr } = await admin
    .from('events')
    .insert([
      {
        church_id: ctx.churchId,
        campus_id: ctx.campusId,
        event_type_id: prayerType,
        title: 'Prayer night',
        starts_at: prayerStart.toISOString(),
        ends_at: new Date(prayerStart.getTime() + 2 * 36e5).toISOString(),
        timezone: 'America/Chicago',
        visibility: 'public',
        status: 'published',
        published_at: now,
        host_profile_id: pid('church_admin'),
        venue_kind: 'campus',
        city: 'Midland',
        region: 'TX',
      },
      {
        church_id: ctx.churchId,
        campus_id: ctx.campusId,
        event_type_id: homeType,
        title: 'Tuesday home group',
        starts_at: homeStart.toISOString(),
        ends_at: new Date(homeStart.getTime() + 2 * 36e5).toISOString(),
        timezone: 'America/Chicago',
        visibility: 'private',
        status: 'published',
        published_at: now,
        host_profile_id: pid('member'),
        venue_kind: 'home',
        hide_address_until_rsvp: true,
        city: 'Midland',
        region: 'TX',
      },
      {
        church_id: ctx.secondChurchId,
        campus_id: ctx.secondCampusId,
        event_type_id: otherType,
        title: 'Prayer at Test Church Two',
        starts_at: otherStart.toISOString(),
        ends_at: new Date(otherStart.getTime() + 2 * 36e5).toISOString(),
        timezone: 'America/Chicago',
        visibility: 'public',
        status: 'published',
        published_at: now,
        host_profile_id: pid('other_admin'),
        venue_kind: 'campus',
        city: 'Loop',
        region: 'TX',
      },
    ])
    .select('id, title');
  if (eErr || !events) return `Gatherings: ${eErr?.message ?? 'unknown'}`;
  const eid = (title: string) => (events as Array<{ id: string; title: string }>).find((e) => e.title === title)!.id;
  const home = eid('Tuesday home group');
  const { error: addrErr } = await admin
    .from('event_addresses')
    .insert({ event_id: home, address_line1: '1200 Test Lane', postal_code: '79701' });
  if (addrErr) return `Home address: ${addrErr.message}`;
  const { error: audErr } = await admin.from('event_audiences').insert({ event_id: home, group_id: gid('Tuesday Home Group') });
  if (audErr) return `Audience: ${audErr.message}`;
  const rsvps = [
    { event_id: home, profile_id: pid('participant_done'), status: 'going' },
    { event_id: eid('Prayer night'), profile_id: pid('participant_mid'), status: 'going' },
  ].filter((r) => r.profile_id);
  const { error: rErr } = await admin.from('event_rsvps').insert(rsvps);
  if (rErr) return `RSVPs: ${rErr.message}`;

  // Contact history: the in-progress person was called by their connector;
  // the new one has heard from nobody (so the nudge and This week show it).
  const { data: connector } = await admin
    .from('connectors')
    .select('id')
    .eq('profile_id', pid('connector_1'))
    .maybeSingle();
  const mid = ctx.participantIdByKey.get('participant_mid');
  if (mid && connector) {
    await admin.from('participants').update({ assigned_connector_id: (connector as { id: string }).id }).eq('id', mid);
    const { error: tErr } = await admin.from('participant_touches').insert({
      participant_id: mid,
      church_id: ctx.churchId,
      kind: 'call',
      source: 'manual',
      summary: 'Called to say welcome. Wants to visit the Tuesday group.',
      occurred_at: new Date(Date.now() - 3 * 864e5).toISOString(),
      created_by_profile_id: pid('connector_1'),
    });
    if (tErr) return `Contact log: ${tErr.message}`;
  }
  return null;
}
