'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth, requireCampusAdmin, getSession } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { materializeEligibilityRing } from './audience';
import type {
  CreateEventInput,
  EventRow,
  ReportReason,
  ReportResolution,
  RsvpStatus,
  ServiceResult,
} from './types';

/**
 * Event lifecycle: create, RSVP, cancel, report, pin.
 *
 * Phase 1 publishes SILENTLY — no notification fan-out yet. That lands in
 * phase 2 along with profiles-based SMS consent capture and the per-host
 * recipient cap. Everything here is written so the fan-out slots in at
 * `publishEvent` without reshaping anything.
 */

function fail(error: string): ServiceResult<never> {
  return { success: false, error };
}

/** Can this person host? Anyone who's been through the connect platform,
 *  plus staff. Mirrors the SQL `ec_can_host_events()`. */
export async function canHostEvents(): Promise<boolean> {
  const session = await getSession();
  if (!session?.profile) return false;
  if (session.profile.is_platform_admin) return true;
  if (session.profile.role !== 'participant') return true;

  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('participants')
    .select('id, status')
    .eq('profile_id', session.id)
    .in('status', ['connected', 'completed'])
    .maybeSingle();
  return Boolean(data);
}

export async function createEvent(
  input: CreateEventInput,
): Promise<ServiceResult<{ id: string }>> {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) return fail('Your profile is not attached to a church.');

  if (!(await canHostEvents())) {
    return fail(
      'Hosting is open to people who have been through the connect journey. ' +
        'Reach out to your connector if you think this is a mistake.',
    );
  }

  if (!input.title?.trim()) return fail('Give the event a title.');
  if (!input.starts_at || !input.ends_at) return fail('Set a start and end time.');
  if (new Date(input.ends_at) <= new Date(input.starts_at)) {
    return fail('The end time has to be after the start time.');
  }

  const groupIds = input.group_ids ?? [];
  const churchWide = input.audience_is_church_wide ?? false;

  // A private event must say who it's for. We deliberately do NOT treat "no
  // groups picked" as "everyone" — that silent widening is the exact failure
  // the binary visibility model exists to prevent.
  if (input.visibility === 'private' && !churchWide && groupIds.length === 0) {
    if ((input.invite_profile_ids ?? []).length === 0) {
      return fail(
        'Choose who this private event is for — one or more groups, specific ' +
          'people, or everyone at your church.',
      );
    }
  }

  const supabase = await createServerSupabaseClient();
  const publish = input.publish ?? true;

  const { data, error } = await supabase
    .from('events')
    .insert({
      church_id: churchId,
      campus_id: input.campus_id ?? session.profile?.campus_id ?? null,
      event_type_id: input.event_type_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      timezone: input.timezone ?? 'America/Chicago',
      all_day: input.all_day ?? false,
      visibility: input.visibility,
      audience_is_church_wide: churchWide,
      invite_ring: input.invite_ring ?? 'members_only',
      status: publish ? 'published' : 'draft',
      published_at: publish ? new Date().toISOString() : null,
      host_profile_id: session.id,
      location_name: input.location_name?.trim() || null,
      address_line1: input.address_line1?.trim() || null,
      address_line2: input.address_line2?.trim() || null,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      postal_code: input.postal_code?.trim() || null,
      is_private_residence: input.is_private_residence ?? false,
      // Only meaningful on a private event — a public event's address is
      // public by definition.
      hide_address_until_rsvp:
        input.visibility === 'private' && (input.hide_address_until_rsvp ?? false),
      scheduling_location_id: input.scheduling_location_id ?? null,
      capacity: input.capacity ?? null,
      rsvp_required: input.rsvp_required ?? false,
      rsvp_deadline: input.rsvp_deadline ?? null,
      image_url: input.image_url ?? null,
      created_by_channel: 'web',
    })
    .select('id')
    .single();

  if (error || !data) {
    return fail(error?.message ?? 'Could not create the event.');
  }

  const eventId = (data as { id: string }).id;
  const admin = await createServiceRoleClient();

  if (groupIds.length > 0) {
    await admin.from('event_audiences').insert(
      groupIds.map((group_id) => ({ event_id: eventId, group_id })),
    );
  }

  if ((input.invite_profile_ids ?? []).length > 0) {
    await admin.from('event_invites').insert(
      input.invite_profile_ids!.map((profile_id) => ({
        event_id: eventId,
        profile_id,
        invited_by_profile_id: session.id,
      })),
    );
  }

  // "Notify others who could be invited": pull in each targeted group's parent
  // ring. This writes the ring into event_audiences rather than treating it as
  // a notify-only list, so the people we're about to invite can actually open
  // the link — see lib/events/audience.ts.
  if ((input.invite_ring ?? 'members_only') === 'members_plus_eligible') {
    await materializeEligibilityRing(admin, eventId);
  }

  await recordAudit({
    action: publish ? 'event.published' : 'event.drafted',
    entity_type: 'event',
    entity_id: eventId,
    metadata: {
      visibility: input.visibility,
      invite_ring: input.invite_ring ?? 'members_only',
      group_count: groupIds.length,
      church_wide: churchWide,
      is_private_residence: input.is_private_residence ?? false,
    },
  });

  revalidatePath('/');
  return { success: true, data: { id: eventId } };
}

export async function rsvpToEvent(
  eventId: string,
  status: RsvpStatus,
  guestCount = 0,
): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // RLS on event_rsvps checks `ec_can_see_event(event_id)` in WITH CHECK, so an
  // RSVP to an event you can't see is rejected by the database, not by a check
  // here that could drift.
  const { error } = await supabase.from('event_rsvps').upsert(
    {
      event_id: eventId,
      profile_id: session.id,
      status,
      guest_count: Math.max(0, guestCount),
      responded_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,profile_id' },
  );

  if (error) return fail(error.message);

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

export async function cancelEvent(
  eventId: string,
  reason: string,
): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // Cancel rather than delete: the event stays visible to its audience with a
  // banner, so nobody shows up to a cancelled home group.
  const { error } = await supabase
    .from('events')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason?.trim() || null,
      cancelled_by_profile_id: session.id,
    })
    .eq('id', eventId);

  if (error) return fail(error.message);

  await recordAudit({
    action: 'event.cancelled',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { reason: reason?.trim() || null },
  });

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

/**
 * Report an event.
 *
 * Trust-then-verify: the first report hides the event and alerts admins. What
 * keeps that safe from griefing is *who can report* — the RLS INSERT policy is
 * `ec_can_see_event(event_id)`, the same rule as the read path. So a private
 * event can only be reported by its targeted audience (curated, named,
 * auditable people) and anonymous visitors can't report at all.
 *
 * The admin SMS is enqueued in phase 2 with the rest of the event
 * notifications; for now the event is pulled and lands in /hub/review.
 */
export async function reportEvent(
  eventId: string,
  reason: ReportReason,
  note?: string,
): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error: reportError } = await supabase.from('event_reports').insert({
    event_id: eventId,
    reporter_profile_id: session.id,
    reason,
    note: note?.trim() || null,
  });

  if (reportError) {
    // UNIQUE (event_id, reporter_profile_id) — one report per person.
    if (reportError.code === '23505') {
      return fail('You have already reported this event. An admin is reviewing it.');
    }
    return fail(reportError.message);
  }

  // Pull it from the hub immediately. Service-role because an ordinary member
  // has no UPDATE rights on someone else's event — the report is their
  // authority, not a general edit permission.
  const admin = await createServiceRoleClient();
  await admin
    .from('events')
    .update({
      status: 'hidden',
      hidden_at: new Date().toISOString(),
      hidden_reason: `Reported: ${reason}`,
    })
    .eq('id', eventId)
    .eq('status', 'published');

  await recordAudit({
    action: 'event.reported',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { reason },
  });

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

/** Admin resolution of a report from /hub/review. */
export async function resolveEventReport(
  eventId: string,
  resolution: ReportResolution,
): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const admin = await createServiceRoleClient();

  const nextStatus: Partial<EventRow> =
    resolution === 'restored'
      ? { status: 'published', hidden_at: null, hidden_reason: null }
      : resolution === 'cancelled'
        ? {
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by_profile_id: session.id,
          }
        : {};

  if (Object.keys(nextStatus).length > 0) {
    await admin.from('events').update(nextStatus).eq('id', eventId);
  }

  await admin
    .from('event_reports')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by_profile_id: session.id,
      resolution,
    })
    .eq('event_id', eventId)
    .is('resolved_at', null);

  await recordAudit({
    action: 'event.report_resolved',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { resolution },
  });

  revalidatePath('/');
  revalidatePath('/hub/review');
  return { success: true, data: null };
}

/** Pin/unpin. Admin-only, and deliberately does NOT change visibility —
 *  a pinned private event is still private. */
export async function setEventPinned(
  eventId: string,
  pinned: boolean,
): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('events')
    .update({
      pinned_at: pinned ? new Date().toISOString() : null,
      pinned_by_profile_id: pinned ? session.id : null,
    })
    .eq('id', eventId);

  if (error) return fail(error.message);

  await recordAudit({
    action: pinned ? 'event.pinned' : 'event.unpinned',
    entity_type: 'event',
    entity_id: eventId,
  });

  revalidatePath('/');
  return { success: true, data: null };
}
