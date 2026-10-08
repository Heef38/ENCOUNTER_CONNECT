import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveProfileDelivery } from '@/lib/notifications/enqueue';
import type { NotificationChannel } from '@/lib/notifications/types';
import type { AudiencePreview, EventRow } from './types';

/**
 * The notify side of the audience rule.
 *
 * `ec_can_see_event()` (migration 027) decides who can SEE an event and is
 * wired directly into RLS. This module decides who gets TOLD. The two must
 * agree, because two independent implementations of "who is in the audience"
 * is exactly how the men end up getting a text about girls night.
 *
 * They're kept in agreement by construction:
 *   - Both resolve group membership through the same `event_audiences ⋈
 *     group_members` join.
 *   - The eligibility ring is not a separate notify-only concept. Opting into
 *     `invite_ring='members_plus_eligible'` writes the parent groups into
 *     `event_audiences` (flagged `is_eligibility_ring`), so the ring is inside
 *     the visibility rule too. Otherwise a ring member would get a text
 *     linking to a 403.
 *
 * The test matrix in docs/connection-hub-plan.md §4 asserts the agreement.
 */

export interface AudienceMember {
  profile_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sms_consent_at: string | null;
}

/**
 * Expands an event's targeted groups to include their parent/eligibility rings
 * and writes the ring rows into `event_audiences`.
 *
 * This is the single mechanism behind "notify others who could be invited":
 * a girls-night event targeting Women's Ministry can reach everyone in the
 * parent "Women" roster who isn't already in the ministry — without storing
 * anyone's gender.
 *
 * Idempotent: re-running adds nothing new (UNIQUE on (event_id, group_id)).
 */
export async function materializeEligibilityRing(
  admin: SupabaseClient,
  eventId: string,
): Promise<{ addedGroupIds: string[] }> {
  const { data: targeted } = await admin
    .from('event_audiences')
    .select('group_id, is_eligibility_ring')
    .eq('event_id', eventId);

  const rows = (targeted ?? []) as Array<{
    group_id: string;
    is_eligibility_ring: boolean;
  }>;
  // Only real targets contribute a parent — we don't chase a ring's own parent,
  // which would silently widen the audience a second time.
  const targetGroupIds = rows.filter((r) => !r.is_eligibility_ring).map((r) => r.group_id);
  if (targetGroupIds.length === 0) return { addedGroupIds: [] };

  const { data: parents } = await admin
    .from('groups')
    .select('id, parent_group_id')
    .in('id', targetGroupIds)
    .not('parent_group_id', 'is', null);

  const existing = new Set(rows.map((r) => r.group_id));
  const parentIds = Array.from(
    new Set(
      ((parents ?? []) as Array<{ id: string; parent_group_id: string | null }>)
        .map((g) => g.parent_group_id)
        .filter((id): id is string => id !== null && !existing.has(id)),
    ),
  );

  if (parentIds.length === 0) return { addedGroupIds: [] };

  await admin.from('event_audiences').insert(
    parentIds.map((group_id) => ({
      event_id: eventId,
      group_id,
      is_eligibility_ring: true,
    })),
  );

  return { addedGroupIds: parentIds };
}

/**
 * Every profile in an event's notification audience, deduplicated.
 *
 * Mirrors `ec_can_see_event`'s audience arm exactly:
 *   church_wide           → every active profile in the church
 *   audience_is_church_wide → same (an explicit choice on a private event)
 *   otherwise             → members of the targeted groups (rings included,
 *                           since they're rows in event_audiences) ∪ named
 *                           invitees
 *
 * The host and cohost are excluded — they don't need telling about their own
 * event.
 */
export async function resolveEventAudience(
  admin: SupabaseClient,
  event: Pick<
    EventRow,
    | 'id'
    | 'church_id'
    | 'invite_ring'
    | 'audience_is_church_wide'
    | 'visibility'
    | 'host_profile_id'
    | 'cohost_profile_id'
  >,
): Promise<AudienceMember[]> {
  const PROFILE_FIELDS = 'id, first_name, last_name, email, phone, sms_consent_at';
  const byId = new Map<string, AudienceMember>();

  const add = (
    p: {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      sms_consent_at: string | null;
    } | null,
  ) => {
    if (!p) return;
    if (p.id === event.host_profile_id || p.id === event.cohost_profile_id) return;
    byId.set(p.id, {
      profile_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      sms_consent_at: p.sms_consent_at,
    });
  };

  const churchWide =
    event.invite_ring === 'church_wide' ||
    // A public event with no targeting still reaches the church when the host
    // asks for it; the audience flag is the explicit signal.
    event.audience_is_church_wide;

  if (churchWide) {
    const { data } = await admin
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('church_id', event.church_id);
    for (const p of (data ?? []) as Parameters<typeof add>[0][]) add(p);
    return Array.from(byId.values());
  }

  // Targeted groups — including any eligibility-ring rows, which were written
  // into event_audiences precisely so visibility and notification agree.
  const { data: audienceRows } = await admin
    .from('event_audiences')
    .select('group_id')
    .eq('event_id', event.id);

  const groupIds = ((audienceRows ?? []) as Array<{ group_id: string }>).map(
    (r) => r.group_id,
  );

  if (groupIds.length > 0) {
    const { data: members } = await admin
      .from('group_members')
      .select(`profile_id, profile:profiles ( ${PROFILE_FIELDS} )`)
      .in('group_id', groupIds);

    for (const m of (members ?? []) as unknown as Array<{
      profile: Parameters<typeof add>[0];
    }>) {
      add(m.profile);
    }
  }

  // Individually invited people.
  const { data: invites } = await admin
    .from('event_invites')
    .select(`profile_id, profile:profiles ( ${PROFILE_FIELDS} )`)
    .eq('event_id', event.id);

  for (const i of (invites ?? []) as unknown as Array<{ profile: Parameters<typeof add>[0] }>) {
    add(i.profile);
  }

  return Array.from(byId.values());
}

/**
 * Counts-only preview for the create/publish form.
 *
 * The host sees how far their message reaches — "38 people: 26 by text, 12 by
 * email, 9 skipped" — without being handed a roster. That's the minimum-info
 * principle applied to the megaphone: enough to make an informed decision,
 * not a directory export.
 */
export async function previewEventAudience(
  eventId: string,
  channel: NotificationChannel = 'sms',
): Promise<AudiencePreview> {
  const admin = await createServiceRoleClient();

  const { data: eventRow } = await admin
    .from('events')
    .select(
      'id, church_id, invite_ring, audience_is_church_wide, visibility, host_profile_id, cohost_profile_id',
    )
    .eq('id', eventId)
    .maybeSingle();

  const empty: AudiencePreview = {
    total: 0,
    by_email: 0,
    by_sms: 0,
    skipped_no_consent: 0,
    skipped_no_contact: 0,
    group_names: [],
    includes_eligibility_ring: false,
    over_daily_cap_by: 0,
  };

  if (!eventRow) return empty;
  const event = eventRow as Parameters<typeof resolveEventAudience>[1];

  const members = await resolveEventAudience(admin, event);

  let bySms = 0;
  let byEmail = 0;
  let noConsent = 0;
  let noContact = 0;

  for (const m of members) {
    // Same consent gate the enqueue path uses, so the preview can't promise a
    // text that resolveProfileDelivery will later refuse to send.
    const sms = resolveProfileDelivery('sms', m);
    const email = resolveProfileDelivery('email', m);

    if (channel === 'sms' && sms.ok) {
      bySms += 1;
    } else if (email.ok) {
      byEmail += 1;
      if (channel === 'sms' && !sms.ok && m.phone) noConsent += 1;
    } else if (channel === 'sms' && !m.phone && !m.email) {
      noContact += 1;
    } else if (!m.email && !sms.ok) {
      noContact += 1;
    }
  }

  const { data: audienceGroups } = await admin
    .from('event_audiences')
    .select('is_eligibility_ring, group:groups ( name )')
    .eq('event_id', eventId);

  const groupRows = (audienceGroups ?? []) as unknown as Array<{
    is_eligibility_ring: boolean;
    group: { name: string } | null;
  }>;

  return {
    total: members.length,
    by_email: byEmail,
    by_sms: bySms,
    skipped_no_consent: noConsent,
    skipped_no_contact: noContact,
    group_names: groupRows.map((g) => g.group?.name).filter((n): n is string => !!n),
    includes_eligibility_ring: groupRows.some((g) => g.is_eligibility_ring),
    over_daily_cap_by: 0, // wired with the cap in phase 2
  };
}
