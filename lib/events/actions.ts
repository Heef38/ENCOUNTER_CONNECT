'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth, requireCampusAdmin, getSession } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { getChurchContext } from '@/lib/church/context';
import {
  enqueueEventCancelled,
  enqueueEventReported,
  enqueueMessageToHost,
} from '@/lib/notifications/events';
import { materializeEligibilityRing } from './audience';
import {
  dbMessage,
  fail,
  geocodeFor,
  insertGatherings,
  isStaffProfile,
  prepareEventInput,
  resolveTimes,
} from './write';
import type {
  EventInput,
  EventRow,
  ReportReason,
  ReportResolution,
  RsvpStatus,
  ServiceResult,
} from './types';

/**
 * Gathering lifecycle: create (once or weekly), edit, publish, RSVP, check
 * in, cancel, report, pin, message the host.
 *
 * Writes go through the signed-in user's client, so row-level security and
 * the guard triggers (migrations 027, 032, 033) decide what is allowed:
 * who may host, which groups a member may target, that audiences stay in
 * the church, that a youth gathering stays private, that a home is never a
 * public pin, that a host cannot un-hide a reported gathering. The checks
 * here exist to give a clear message first; the database is the authority,
 * and its RAISE messages are written to be shown to people as-is.
 */


const MAX_GUESTS = 10;

/** Can this person host? The database's ec_can_host_events() decides. */
export async function canHostEvents(): Promise<boolean> {
  const session = await getSession();
  if (!session?.profile) return false;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('ec_can_host_events');
  return data === true;
}

export async function createEvent(input: EventInput): Promise<ServiceResult<{ id: string; count: number }>> {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) return fail('Your profile is not attached to a church.');

  if (!(await canHostEvents())) {
    return fail(
      'Hosting opens up once you have met with your connector and done the short host orientation. ' +
        'Ask your church if you think this is a mistake.',
    );
  }

  const church = await getChurchContext(churchId);
  if (!church) return fail('Church not found.');

  const prepared = prepareEventInput(input, isStaffProfile(session));
  if (!prepared.success) return prepared;

  if (input.visibility === 'public' && input.venue_kind === 'home' && !church.settings.allow_public_home_events) {
    return fail('Your church keeps home gatherings private. Make this one private, or meet somewhere public.');
  }

  const supabase = await createServerSupabaseClient();
  const created = await insertGatherings(supabase, {
    input,
    prepared: prepared.data,
    churchId,
    timezone: church.timezone,
    hostProfileId: session.id,
    invitedBy: session.id,
  });
  if (!created.success) return created;
  const { ids, seriesId, publish, groupIds } = created.data;

  await recordAudit({
    action: publish ? 'event.published' : 'event.drafted',
    entity_type: 'event',
    entity_id: ids[0],
    metadata: {
      visibility: input.visibility,
      venue_kind: input.venue_kind,
      invite_ring: input.invite_ring ?? 'members_only',
      group_count: groupIds.length,
      church_wide: prepared.data.fields.audience_is_church_wide,
      weeks: ids.length,
      series_id: seriesId,
    },
  });

  revalidatePath('/');
  return { success: true, data: { id: ids[0], count: ids.length } };
}

/**
 * Edit a gathering. `scope = 'future'` applies the change to this and every
 * later gathering in its weekly series, keeping each one's own date.
 */
export async function updateEvent(
  eventId: string,
  input: EventInput,
  scope: 'one' | 'future' = 'one',
): Promise<ServiceResult<{ id: string; count: number }>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: current } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
  const existing = current as EventRow | null;
  if (!existing) return fail('Gathering not found.');

  const church = await getChurchContext(existing.church_id);
  if (!church) return fail('Church not found.');

  const prepared = prepareEventInput(input, isStaffProfile(session));
  if (!prepared.success) return prepared;
  const p = prepared.data;

  if (
    input.visibility === 'public' && input.venue_kind === 'home' && !church.settings.allow_public_home_events
  ) {
    return fail('Your church keeps home gatherings private.');
  }
  // Keep the original acknowledgement time when it was already public.
  if (existing.public_home_acknowledged_at && p.fields.public_home_acknowledged_at) {
    p.fields.public_home_acknowledged_at = existing.public_home_acknowledged_at;
  }

  let targets: EventRow[] = [existing];
  if (scope === 'future' && existing.series_id) {
    const { data: series } = await supabase
      .from('events')
      .select('*')
      .eq('series_id', existing.series_id)
      .gte('starts_at', existing.starts_at)
      .in('status', ['published', 'draft']);
    targets = ((series ?? []) as EventRow[]).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    if (!targets.some((t) => t.id === existing.id)) targets.unshift(existing);
  }

  for (const t of targets) {
    // The edited gathering takes the new date; later ones keep their own.
    const date =
      t.id === existing.id
        ? input.date
        : new Intl.DateTimeFormat('en-CA', { timeZone: church.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t.starts_at));
    const times = resolveTimes(date, input.start_time, input.end_time, church.timezone);
    if (!times) return fail('Check the date and times.');

    const { data: saved, error } = await supabase
      .from('events')
      .update({ ...p.fields, ...times, timezone: church.timezone })
      .eq('id', t.id)
      .select('id');
    if (error) return fail(dbMessage(error, 'Could not save the change.'));
    // RLS hides rows you may not edit: no error, nothing changed.
    if (!saved || saved.length === 0) return fail('Only the host or an admin can edit this gathering.');
  }

  const ids = targets.map((t) => t.id);

  if (p.address) {
    const pin = await geocodeFor(input, p);
    const { error } = await supabase.from('event_addresses').upsert(
      ids.map((id) => ({
        event_id: id,
        ...p.address,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        geocoded_at: pin ? new Date().toISOString() : null,
      })),
      { onConflict: 'event_id' },
    );
    if (error) return fail(dbMessage(error, 'Could not save the address.'));
  } else {
    await supabase.from('event_addresses').delete().in('event_id', ids);
  }

  // Re-sync the audience: replace targeted groups, then rebuild the ring.
  const groupIds = p.fields.audience_is_church_wide || input.visibility === 'public' ? [] : input.group_ids ?? [];
  const { error: delErr } = await supabase.from('event_audiences').delete().in('event_id', ids);
  if (delErr) return fail(dbMessage(delErr, 'Could not update who this is for.'));
  if (groupIds.length > 0) {
    const { error } = await supabase
      .from('event_audiences')
      .insert(ids.flatMap((event_id) => groupIds.map((group_id) => ({ event_id, group_id }))));
    if (error) return fail(dbMessage(error, 'Could not update who this is for.'));
  }
  if ((input.invite_ring ?? 'members_only') === 'members_plus_eligible' && groupIds.length > 0) {
    const admin = await createServiceRoleClient();
    for (const id of ids) await materializeEligibilityRing(admin, id);
  }

  await recordAudit({
    action: 'event.updated',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { scope, count: ids.length, visibility: input.visibility, venue_kind: input.venue_kind },
  });

  revalidatePath('/');
  for (const id of ids) revalidatePath(`/hub/e/${id}`);
  return { success: true, data: { id: eventId, count: ids.length } };
}

/** Publish a draft (and the rest of its series, when asked). */
export async function publishEvent(eventId: string, scope: 'one' | 'future' = 'one'): Promise<ServiceResult<null>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data: current } = await supabase.from('events').select('id, series_id, starts_at, status').eq('id', eventId).maybeSingle();
  const e = current as Pick<EventRow, 'id' | 'series_id' | 'starts_at' | 'status'> | null;
  if (!e) return fail('Gathering not found.');

  let query = supabase
    .from('events')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('status', 'draft');
  query = scope === 'future' && e.series_id
    ? query.eq('series_id', e.series_id).gte('starts_at', e.starts_at)
    : query.eq('id', e.id);
  const { data: published, error } = await query.select('id');
  if (error) return fail(dbMessage(error, 'Could not publish it.'));
  if (!published || published.length === 0) return fail('Only the host can publish this draft.');

  await recordAudit({ action: 'event.published', entity_type: 'event', entity_id: eventId, metadata: { from: 'draft', scope } });
  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

export async function rsvpToEvent(
  eventId: string,
  status: RsvpStatus,
  guestCount = 0,
): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  if (!['going', 'maybe', 'not_going'].includes(status)) return fail('Pick going, maybe, or can’t make it.');
  const guests = status === 'going' ? Math.min(Math.max(Math.floor(guestCount), 0), MAX_GUESTS) : 0;

  const supabase = await createServerSupabaseClient();
  // RLS checks ec_can_see_event(event_id) in WITH CHECK, so an RSVP to a
  // gathering you can't see is rejected by the database.
  const { error } = await supabase.from('event_rsvps').upsert(
    {
      event_id: eventId,
      profile_id: session.id,
      status,
      guest_count: guests,
      responded_at: new Date().toISOString(),
    },
    { onConflict: 'event_id,profile_id' },
  );
  if (error) return fail(dbMessage(error, 'Could not save your RSVP.'));

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

/** Host, cohost or staff mark who came. */
export async function setAttendance(
  eventId: string,
  profileId: string,
  attended: boolean,
): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('event_rsvps')
    .update({
      attended_at: attended ? new Date().toISOString() : null,
      checked_in_by_profile_id: attended ? session.id : null,
    })
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .select('id');
  if (error) return fail(dbMessage(error, 'Could not record attendance.'));
  if (!data || data.length === 0) return fail('Only the host can check people in.');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

export async function cancelEvent(
  eventId: string,
  reason: string,
  scope: 'one' | 'future' = 'one',
): Promise<ServiceResult<{ notified: number }>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: current } = await supabase.from('events').select('id, series_id, starts_at').eq('id', eventId).maybeSingle();
  const e = current as Pick<EventRow, 'id' | 'series_id' | 'starts_at'> | null;
  if (!e) return fail('Gathering not found.');

  const cleanReason = reason?.trim().slice(0, 300) || null;
  let query = supabase
    .from('events')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cleanReason,
      cancelled_by_profile_id: session.id,
    })
    .in('status', ['published', 'draft']);
  query = scope === 'future' && e.series_id
    ? query.eq('series_id', e.series_id).gte('starts_at', e.starts_at)
    : query.eq('id', e.id);

  // Cancel rather than delete: it stays visible to its audience with a
  // banner, so nobody shows up to a home group that quietly vanished.
  const { data: cancelled, error } = await query.select('id');
  if (error) return fail(dbMessage(error, 'Could not cancel it.'));
  if (!cancelled || cancelled.length === 0) return fail('Only the host or an admin can cancel this gathering.');

  const admin = await createServiceRoleClient();
  let notified = 0;
  for (const row of (cancelled ?? []) as Array<{ id: string }>) {
    try {
      notified += await enqueueEventCancelled(admin, { eventId: row.id, reason: cleanReason, cancelledBy: session.id });
    } catch (err) {
      console.error('[events] cancel notice failed', err);
    }
  }

  await recordAudit({
    action: 'event.cancelled',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { reason: cleanReason, scope, count: (cancelled ?? []).length, notified },
  });

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: { notified } };
}

/**
 * Report a gathering.
 *
 * Only people who can see a gathering can report it (the RLS INSERT policy
 * is ec_can_see_event). The first report takes it off the hub when the
 * reporter has standing in the church that owns it: connected there, or
 * staff there. Anyone else's report is recorded and sent to that church's
 * admins without pulling the gathering, so a fresh account cannot hide a
 * church's week (rethink §7.5).
 */
export async function reportEvent(
  eventId: string,
  reason: ReportReason,
  note?: string,
): Promise<ServiceResult<{ hidden: boolean }>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: report, error: reportError } = await supabase
    .from('event_reports')
    .insert({
      event_id: eventId,
      reporter_profile_id: session.id,
      reason,
      note: note?.trim().slice(0, 1000) || null,
    })
    .select('id')
    .single();

  if (reportError || !report) {
    if (reportError?.code === '23505') {
      return fail('You have already reported this. An admin is looking at it.');
    }
    return fail(dbMessage(reportError, 'Could not send the report.'));
  }

  const admin = await createServiceRoleClient();
  const { data: ev } = await admin.from('events').select('id, church_id, status').eq('id', eventId).maybeSingle();
  const event = ev as { id: string; church_id: string; status: string } | null;
  if (!event) return fail('Gathering not found.');

  const profile = session.profile;
  const staffThere =
    Boolean(profile?.is_platform_admin) ||
    (profile?.church_id === event.church_id && (profile?.role ?? 'participant') !== 'participant');
  let standing = staffThere;
  if (!standing && profile?.church_id === event.church_id) {
    const { data: part } = await admin
      .from('participants')
      .select('id')
      .eq('profile_id', session.id)
      .eq('church_id', event.church_id)
      .in('status', ['connected', 'completed'])
      .limit(1);
    standing = (part ?? []).length > 0;
  }

  let hidden = false;
  if (standing && event.status === 'published') {
    const { data: updated } = await admin
      .from('events')
      .update({ status: 'hidden', hidden_at: new Date().toISOString(), hidden_reason: `Reported: ${reason}` })
      .eq('id', eventId)
      .eq('status', 'published')
      .select('id');
    hidden = (updated ?? []).length > 0;
  }

  try {
    const reporterName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || 'A member';
    await enqueueEventReported(admin, {
      eventId,
      reporterName: profile?.church_id === event.church_id ? reporterName : `${reporterName} (from another church)`,
      reason,
      hidden,
      reportId: (report as { id: string }).id,
    });
  } catch (err) {
    console.error('[events] report alert failed', err);
  }

  await recordAudit({
    action: 'event.reported',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { reason, hidden, reporter_has_standing: standing },
  });

  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  revalidatePath('/hub/review');
  return { success: true, data: { hidden } };
}

/** Admin resolution of a report from /hub/review. */
export async function resolveEventReport(
  eventId: string,
  resolution: ReportResolution,
): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const admin = await createServiceRoleClient();

  const { data: ev } = await admin.from('events').select('id, church_id, host_profile_id, status').eq('id', eventId).maybeSingle();
  const event = ev as { id: string; church_id: string; host_profile_id: string | null; status: string } | null;
  if (!event) return fail('Gathering not found.');
  // Each church moderates its own gatherings.
  if (!session.profile?.is_platform_admin && event.church_id !== session.profile?.church_id) {
    return fail('That gathering belongs to another church.');
  }

  const now = new Date().toISOString();
  if (resolution === 'restored') {
    await admin.from('events').update({ status: 'published', hidden_at: null, hidden_reason: null }).eq('id', eventId);
  } else if (resolution === 'cancelled' || resolution === 'host_blocked') {
    await admin
      .from('events')
      .update({ status: 'cancelled', cancelled_at: now, cancelled_by_profile_id: session.id, cancellation_reason: 'Removed by the church.' })
      .eq('id', eventId);
  } else if (event.status === 'hidden') {
    // "No action": the report did not hold up, so the gathering goes back up.
    await admin.from('events').update({ status: 'published', hidden_at: null, hidden_reason: null }).eq('id', eventId);
  }

  if (resolution === 'host_blocked' && event.host_profile_id) {
    await admin
      .from('profiles')
      .update({ host_blocked_at: now, host_blocked_by: session.id })
      .eq('id', event.host_profile_id)
      .eq('church_id', event.church_id);
  }

  await admin
    .from('event_reports')
    .update({ resolved_at: now, resolved_by_profile_id: session.id, resolution })
    .eq('event_id', eventId)
    .is('resolved_at', null);

  await recordAudit({
    action: 'event.report_resolved',
    entity_type: 'event',
    entity_id: eventId,
    metadata: { resolution, host_blocked: resolution === 'host_blocked' },
  });

  revalidatePath('/');
  revalidatePath('/hub/review');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

/** Pin/unpin. Admin-only (the database enforces it), and pinning never
 *  changes visibility — a pinned private gathering is still private. */
export async function setEventPinned(eventId: string, pinned: boolean): Promise<ServiceResult<null>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('events')
    .update({ pinned_at: pinned ? new Date().toISOString() : null, pinned_by_profile_id: pinned ? session.id : null })
    .eq('id', eventId)
    .select('id');
  if (error) return fail(dbMessage(error, 'Could not pin it.'));
  if (!data || data.length === 0) return fail('Only an admin of this church can pin it.');

  await recordAudit({ action: pinned ? 'event.pinned' : 'event.unpinned', entity_type: 'event', entity_id: eventId });
  revalidatePath('/');
  revalidatePath(`/hub/e/${eventId}`);
  return { success: true, data: null };
}

/** In-app relay to the host. Five messages a day per person. */
export async function messageHost(eventId: string, message: string): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const text = message?.trim();
  if (!text) return fail('Write a message first.');
  if (text.length > 1500) return fail('Keep it under 1,500 characters.');

  // Only people who can see the gathering can write about it.
  const supabase = await createServerSupabaseClient();
  const { data: visible } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle();
  if (!visible) return fail('Gathering not found.');

  const admin = await createServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('notification_outbox')
    .select('id', { count: 'exact', head: true })
    .eq('template_key', 'event_message_to_host')
    .contains('metadata', { sender_profile_id: session.id })
    .gte('created_at', since);
  if ((count ?? 0) >= 5) return fail('You have sent a lot of messages today. Try again tomorrow.');

  const name = [session.profile?.first_name, session.profile?.last_name].filter(Boolean).join(' ').trim() || 'A member';
  const ok = await enqueueMessageToHost(admin, {
    eventId,
    sender: { id: session.id, name, email: session.email ?? session.profile?.email ?? null },
    message: text,
  });
  if (!ok) return fail('The host can’t receive messages right now.');

  await recordAudit({ action: 'event.message_host', entity_type: 'event', entity_id: eventId });
  return { success: true, data: null };
}
