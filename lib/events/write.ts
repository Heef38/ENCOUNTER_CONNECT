import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { requireAuth } from '@/lib/auth/dal';
import { geocodeAddress } from '@/lib/geo/geocode';
import { addDaysToDateKey, zonedWallTimeToUtc } from '@/lib/time/zoned';
import { materializeEligibilityRing } from './audience';
import type { EventInput, ServiceResult } from './types';

/**
 * The write core shared by the gathering actions and "start a home group":
 * input validation, church-timezone times, and inserting a gathering (or a
 * weekly series) with its address, audience and invitees.
 *
 * Inserts run on the caller's own client, so row-level security and the
 * guard triggers decide what is allowed. Not a 'use server' module: these
 * are building blocks, not endpoints.
 */

export const MAX_REPEAT_WEEKS = 12;

export function fail(error: string): ServiceResult<never> {
  return { success: false, error };
}

export function dbMessage(error: { message?: string; code?: string } | null, fallback: string): string {
  if (!error?.message) return fallback;
  if (error.code === '42501' || error.message.startsWith('new row violates row-level security')) {
    // A guard trigger's message is already plain language; a bare RLS
    // rejection is not.
    return error.message.startsWith('new row violates') ? "You don't have permission to do that here." : error.message;
  }
  return error.message;
}

export function trimOrNull(v: string | undefined | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}


export interface Times {
  starts_at: string;
  ends_at: string;
}

export function resolveTimes(date: string, start: string, end: string, timezone: string): Times | null {
  const s = zonedWallTimeToUtc(date, start, timezone);
  let e = zonedWallTimeToUtc(date, end, timezone);
  if (!s || !e) return null;
  // 7pm-12:30am: an end at or before the start is the next morning.
  if (e.getTime() <= s.getTime()) e = zonedWallTimeToUtc(addDaysToDateKey(date, 1), end, timezone);
  if (!e || e.getTime() <= s.getTime()) return null;
  return { starts_at: s.toISOString(), ends_at: e.toISOString() };
}

export interface Prepared {
  fields: Record<string, unknown>;
  address: { address_line1: string | null; address_line2: string | null; postal_code: string | null } | null;
  geocode: boolean;
}

/** Validates an EventInput and maps it to columns (minus times and ids). */
export function prepareEventInput(input: EventInput, isStaff: boolean): ServiceResult<Prepared> {
  if (!input.event_type_id) return fail('Pick what kind of gathering this is.');
  if (!input.title?.trim()) return fail('Give the gathering a name.');
  if (input.title.trim().length > 140) return fail('Keep the name under 140 characters.');
  if ((input.description?.length ?? 0) > 5000) return fail('The description is too long.');

  const venue = input.venue_kind;
  if (!['campus', 'public_place', 'home', 'online'].includes(venue)) return fail('Say where it is.');

  const groupIds = input.group_ids ?? [];
  const churchWide = input.visibility === 'private' && (input.audience_is_church_wide ?? false);
  if (input.visibility === 'private' && !churchWide && groupIds.length === 0 && (input.invite_profile_ids ?? []).length === 0) {
    // "No groups picked" never silently means "everyone" — the failure the
    // binary visibility model exists to prevent.
    return fail('Choose who this private gathering is for: a group you are in, or everyone at your church.');
  }

  if (venue === 'campus' && !input.campus_id) return fail('Pick which campus.');
  if (venue === 'public_place' && !trimOrNull(input.location_name) && !trimOrNull(input.address_line1)) {
    return fail('Add the place name or its address.');
  }
  if (venue === 'home' && !trimOrNull(input.address_line1)) return fail("Add the home's address. It is only shared as you choose below.");
  if ((venue === 'home' || venue === 'public_place') && !trimOrNull(input.city)) return fail('Add the city.');

  if (input.visibility === 'public' && venue === 'home' && !input.acknowledged_public_home) {
    return fail('Confirm you want this home address public, or make the gathering private.');
  }

  // Address hold: never on a public gathering (public means public); always
  // on a private home; the host's choice on a private public place.
  const hold =
    input.visibility === 'public' ? false : venue === 'home' ? true : Boolean(input.hide_address_until_rsvp);

  const capacity = input.capacity == null || input.capacity === 0 ? null : Math.floor(input.capacity);
  if (capacity !== null && (capacity < 1 || capacity > 10000)) return fail('Capacity has to be at least 1.');

  void isStaff;
  return {
    success: true,
    data: {
      fields: {
        event_type_id: input.event_type_id,
        title: input.title.trim(),
        description: trimOrNull(input.description),
        campus_id: input.campus_id || null,
        visibility: input.visibility,
        audience_is_church_wide: churchWide,
        invite_ring: input.invite_ring ?? 'members_only',
        venue_kind: venue,
        location_name: venue === 'campus' ? trimOrNull(input.location_name) : trimOrNull(input.location_name),
        city: venue === 'campus' || venue === 'online' ? null : trimOrNull(input.city),
        region: venue === 'campus' || venue === 'online' ? null : trimOrNull(input.region),
        hide_address_until_rsvp: hold,
        public_home_acknowledged_at:
          input.visibility === 'public' && venue === 'home' ? new Date().toISOString() : null,
        capacity,
        rsvp_required: input.rsvp_required ?? false,
      },
      address:
        venue === 'home' || venue === 'public_place'
          ? {
              address_line1: trimOrNull(input.address_line1),
              address_line2: trimOrNull(input.address_line2),
              postal_code: trimOrNull(input.postal_code),
            }
          : null,
      // Homes are never sent to a geocoder (rethink §7.3).
      geocode: venue === 'public_place',
    },
  };
}

export async function geocodeFor(input: EventInput, prepared: Prepared) {
  if (!prepared.geocode || !prepared.address) return null;
  return geocodeAddress({
    line1: prepared.address.address_line1,
    city: input.city,
    region: input.region,
    postalCode: prepared.address.postal_code,
  });
}

export function isStaffProfile(session: Awaited<ReturnType<typeof requireAuth>>): boolean {
  return Boolean(session.profile?.is_platform_admin) || (session.profile?.role ?? 'participant') !== 'participant';
}


/**
 * Inserts one gathering, or `repeat_weeks` of them sharing a series id,
 * with address, audience and invitees. On any failure it removes what it
 * created, so nothing half-made is left invisible to its audience.
 */
export async function insertGatherings(
  supabase: SupabaseClient,
  args: {
    input: EventInput;
    prepared: Prepared;
    churchId: string;
    timezone: string;
    hostProfileId: string;
    invitedBy: string;
  },
): Promise<ServiceResult<{ ids: string[]; seriesId: string | null; publish: boolean; groupIds: string[] }>> {
  const { input, prepared: p, churchId, timezone } = args;
  const weeks = Math.min(Math.max(Math.floor(input.repeat_weeks ?? 1), 1), MAX_REPEAT_WEEKS);
  const seriesId = weeks > 1 ? randomUUID() : null;
  const publish = input.publish ?? true;
  const now = new Date().toISOString();

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < weeks; i++) {
    const times = resolveTimes(addDaysToDateKey(input.date, 7 * i), input.start_time, input.end_time, timezone);
    if (!times) return fail('Check the date and times.');
    if (i === 0 && new Date(times.ends_at).getTime() < Date.now() - 60_000) {
      return fail('That time has already passed.');
    }
    rows.push({
      ...p.fields,
      ...times,
      church_id: churchId,
      timezone,
      series_id: seriesId,
      series_index: seriesId ? i : null,
      status: publish ? 'published' : 'draft',
      published_at: publish ? now : null,
      host_profile_id: args.hostProfileId,
      created_by_channel: 'web',
    });
  }

  const { data, error } = await supabase.from('events').insert(rows).select('id, series_index');
  if (error || !data || data.length === 0) return fail(dbMessage(error, 'Could not create the gathering.'));

  const ids = (data as Array<{ id: string; series_index: number | null }>)
    .sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0))
    .map((r) => r.id);

  const cleanup = async (message: string): Promise<ServiceResult<never>> => {
    // Only staff can delete through RLS, so the service role removes what
    // this request just created.
    const admin = await createServiceRoleClient();
    await admin.from('events').delete().in('id', ids);
    return fail(message);
  };

  if (p.address) {
    const pin = await geocodeFor(input, p);
    const { error: addrErr } = await supabase.from('event_addresses').insert(
      ids.map((id) => ({
        event_id: id,
        ...p.address,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
        geocoded_at: pin ? now : null,
      })),
    );
    if (addrErr) return cleanup(dbMessage(addrErr, 'Could not save the address.'));
  }

  const groupIds = p.fields.audience_is_church_wide || input.visibility === 'public' ? [] : input.group_ids ?? [];
  if (groupIds.length > 0) {
    const { error: audErr } = await supabase
      .from('event_audiences')
      .insert(ids.flatMap((event_id) => groupIds.map((group_id) => ({ event_id, group_id }))));
    if (audErr) return cleanup(dbMessage(audErr, 'Could not set who this is for.'));
  }

  const invitees = input.invite_profile_ids ?? [];
  if (invitees.length > 0) {
    const { error: invErr } = await supabase.from('event_invites').insert(
      ids.flatMap((event_id) =>
        invitees.map((profile_id) => ({ event_id, profile_id, invited_by_profile_id: args.invitedBy })),
      ),
    );
    if (invErr) return cleanup(dbMessage(invErr, 'Could not invite those people.'));
  }

  if ((input.invite_ring ?? 'members_only') === 'members_plus_eligible' && groupIds.length > 0) {
    // The ring is written into event_audiences, so the people it reaches
    // can actually open the link.
    const admin = await createServiceRoleClient();
    for (const id of ids) await materializeEligibilityRing(admin, id);
  }

  return { success: true, data: { ids, seriesId, publish, groupIds } };
}
