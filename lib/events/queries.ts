import 'server-only';

import { cache } from 'react';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession, type SessionUser } from '@/lib/auth/dal';
import type {
  EventAddressRow,
  EventAttendee,
  EventListFilters,
  EventRow,
  EventType,
  RsvpStatus,
  ViewerEvent,
} from './types';

/**
 * Read path for the connection hub.
 *
 * The authenticated path carries **no visibility WHERE clause**. The `events`
 * RLS SELECT policy is `ec_can_see_event(id)` and the `event_addresses`
 * policy is `ec_can_see_event_address(event_id)` (migration 027), so the
 * database decides both what this user may see and whether they get the
 * street address. Everything below is presentation: time windows, sorting,
 * names, and a TypeScript mirror of the address rule.
 *
 * The anonymous path is the one exception and lives in `listPublicEvents`.
 */

const EVENT_SELECT = `
  *,
  event_type:event_types ( id, name, slug, color ),
  address:event_addresses ( event_id, address_line1, address_line2, postal_code, lat, lng, geocoded_at )
`;

interface JoinedEventRow extends EventRow {
  event_type: { id: string; name: string; slug: string; color: string | null } | null;
  /** Null when RLS withheld it (or the gathering has none). */
  address: EventAddressRow | null;
}

interface CampusPlace {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
}

/** Who is looking, and what they've earned. */
interface ViewerContext {
  profileId: string | null;
  churchId: string | null;
  isPlatformAdmin: boolean;
  /** campus_admin or church_admin. */
  isAdmin: boolean;
  /** connector or above. */
  isStaff: boolean;
  myRsvps: Map<string, { status: RsvpStatus; guests: number }>;
  goingCounts: Map<string, number>;
  hosts: Map<string, { first_name: string; last_name: string }>;
  campuses: Map<string, CampusPlace>;
}

function viewerBase(session: SessionUser | null): Omit<ViewerContext, 'myRsvps' | 'goingCounts' | 'hosts' | 'campuses'> {
  const p = session?.profile ?? null;
  const role = p?.role ?? 'participant';
  return {
    profileId: session?.id ?? null,
    churchId: p?.church_id ?? null,
    isPlatformAdmin: p?.is_platform_admin ?? false,
    isAdmin: (p?.is_platform_admin ?? false) || role === 'church_admin' || role === 'campus_admin',
    isStaff: (p?.is_platform_admin ?? false) || role !== 'participant',
  };
}

function joinAddress(parts: Array<string | null | undefined>): string | null {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return kept.length > 0 ? kept.join(', ') : null;
}

/** The always-safe location label: a venue name and the city. */
function locationLabel(e: EventRow, campus: CampusPlace | null): string | null {
  if (e.venue_kind === 'online') return e.location_name?.trim() || 'Online';
  if (e.venue_kind === 'campus') return e.location_name?.trim() || campus?.name || null;
  const name = e.location_name?.trim();
  const city = e.city?.trim() || null;
  if (name && city) return `${name}, ${city}`;
  return name || city;
}

/**
 * The address gate, mirrored. On the authenticated path the database has
 * already withheld the address row when the viewer has not earned it; this
 * repeats the rule so the anonymous path and any future caller agree.
 *
 *   * campus: the campus address, which is public information
 *   * public gathering: shown (a public home needed the host's confirmation)
 *   * private, address not held: shown to the audience
 *   * private, held until RSVP: host, cohost, admins, or "going" (not "maybe")
 */
function revealAddress(
  e: JoinedEventRow,
  viewer: ViewerContext,
  isHost: boolean,
  campus: CampusPlace | null,
): { address: string | null; hidden: boolean; lat: number | null; lng: number | null } {
  if (e.venue_kind === 'online') return { address: null, hidden: false, lat: null, lng: null };

  if (e.venue_kind === 'campus') {
    const address = campus
      ? joinAddress([campus.address_line1, campus.city, campus.region, campus.postal_code])
      : null;
    return { address, hidden: false, lat: campus?.lat ?? null, lng: campus?.lng ?? null };
  }

  const row = e.address;
  const full = row
    ? joinAddress([row.address_line1, row.address_line2, e.city, e.region, row.postal_code])
    : null;

  const held = e.visibility === 'private' && e.hide_address_until_rsvp;
  const earned =
    !held ||
    isHost ||
    viewer.isPlatformAdmin ||
    (viewer.isAdmin && viewer.churchId === e.church_id) ||
    viewer.myRsvps.get(e.id)?.status === 'going';

  if (!earned) return { address: null, hidden: true, lat: null, lng: null };
  if (!full) {
    // RLS withheld it, or there is none. Only claim "held" when it is.
    return { address: null, hidden: held && !row, lat: null, lng: null };
  }
  return { address: full, hidden: false, lat: row?.lat ?? null, lng: row?.lng ?? null };
}

function hostName(e: EventRow, viewer: ViewerContext): string {
  if (!e.host_profile_id) return 'A former member';
  const h = viewer.hosts.get(e.host_profile_id);
  if (!h) return 'Someone at the church';
  const first = h.first_name?.trim() || 'Someone';
  // Full names stay inside the church. Signed-out visitors, other churches
  // and search engines get a first name and an initial.
  if (viewer.profileId && viewer.churchId === e.church_id) {
    return `${first} ${h.last_name ?? ''}`.trim();
  }
  const initial = h.last_name?.trim()?.[0];
  return initial ? `${first} ${initial}.` : first;
}

function toViewerEvent(row: JoinedEventRow, viewer: ViewerContext): ViewerEvent {
  const isHost =
    viewer.profileId !== null &&
    (viewer.profileId === row.host_profile_id || viewer.profileId === row.cohost_profile_id);
  const sameChurch = viewer.churchId === row.church_id;
  const churchAdmin = viewer.isPlatformAdmin || (viewer.isAdmin && sameChurch);
  const churchStaff = viewer.isPlatformAdmin || (viewer.isStaff && sameChurch);

  const campus = row.campus_id ? viewer.campuses.get(row.campus_id) ?? null : null;
  const { address, hidden, lat, lng } = revealAddress(row, viewer, isHost, campus);
  const mine = viewer.myRsvps.get(row.id);
  const open = row.status === 'published';

  return {
    id: row.id,
    church_id: row.church_id,
    title: row.title,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    all_day: row.all_day,
    series_id: row.series_id,

    status: row.status,
    visibility: row.visibility,
    venue_kind: row.venue_kind,
    is_pinned: row.pinned_at !== null,

    event_type: row.event_type,
    campus: campus ? { id: campus.id, name: campus.name } : null,

    host_name: hostName(row, viewer),

    location_label: locationLabel(row, campus),
    address,
    address_hidden_pending_rsvp: hidden,
    map_lat: row.public_lat === null ? null : Number(row.public_lat),
    map_lng: row.public_lng === null ? null : Number(row.public_lng),
    exact_lat: lat === null ? null : Number(lat),
    exact_lng: lng === null ? null : Number(lng),

    capacity: row.capacity,
    rsvp_required: row.rsvp_required,
    rsvp_deadline: row.rsvp_deadline,
    going_count: viewer.goingCounts.get(row.id) ?? 0,
    my_rsvp: mine?.status ?? null,
    my_guest_count: mine?.guests ?? 0,

    cancellation_reason: row.cancellation_reason,

    is_host: isHost,
    can_edit: (isHost || churchAdmin) && row.status !== 'hidden',
    // You can report anything you can see, except your own gathering.
    can_report: viewer.profileId !== null && !isHost && open,
    can_rsvp:
      viewer.profileId !== null &&
      open &&
      (!row.rsvp_deadline || new Date(row.rsvp_deadline) > new Date()),
    can_check_in: isHost || churchStaff,
    can_pin: churchAdmin,
    can_message_host: viewer.profileId !== null && !isHost && row.host_profile_id !== null,
  };
}

/**
 * Loads what presentation needs beyond the rows themselves.
 *
 * Service-role on purpose, for aggregate or public-safe facts only:
 *   * going counts (a count is safe; the roster is not)
 *   * the viewer's own RSVP
 *   * host first/last names (profiles RLS hides them from members;
 *     hostName() decides how much of the name each viewer gets)
 *   * campus name, address and pin (public information about a building)
 */
async function loadViewerContext(
  session: SessionUser | null,
  rows: JoinedEventRow[],
): Promise<ViewerContext> {
  const ctx: ViewerContext = {
    ...viewerBase(session),
    myRsvps: new Map(),
    goingCounts: new Map(),
    hosts: new Map(),
    campuses: new Map(),
  };
  if (rows.length === 0) return ctx;

  const admin = await createServiceRoleClient();
  const eventIds = rows.map((r) => r.id);
  const hostIds = Array.from(new Set(rows.map((r) => r.host_profile_id).filter((x): x is string => !!x)));
  const campusIds = Array.from(new Set(rows.map((r) => r.campus_id).filter((x): x is string => !!x)));

  const [rsvps, hosts, campuses] = await Promise.all([
    admin.from('event_rsvps').select('event_id, profile_id, status, guest_count').in('event_id', eventIds),
    hostIds.length
      ? admin.from('profiles').select('id, first_name, last_name').in('id', hostIds)
      : Promise.resolve({ data: [] }),
    campusIds.length
      ? admin
          .from('campuses')
          .select('id, name, address_line1, city, region, postal_code, lat, lng')
          .in('id', campusIds)
      : Promise.resolve({ data: [] }),
  ]);

  for (const r of (rsvps.data ?? []) as Array<{ event_id: string; profile_id: string; status: RsvpStatus; guest_count: number }>) {
    if (r.status === 'going') {
      ctx.goingCounts.set(r.event_id, (ctx.goingCounts.get(r.event_id) ?? 0) + 1 + (r.guest_count ?? 0));
    }
    if (ctx.profileId && r.profile_id === ctx.profileId) {
      ctx.myRsvps.set(r.event_id, { status: r.status, guests: r.guest_count ?? 0 });
    }
  }
  for (const h of (hosts.data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
    ctx.hosts.set(h.id, h);
  }
  for (const c of (campuses.data ?? []) as CampusPlace[]) {
    ctx.campuses.set(c.id, c);
  }
  return ctx;
}

function applyFilters<T>(query: T, filters: EventListFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.from) q = q.gte('starts_at', filters.from);
  if (filters.to) q = q.lt('starts_at', filters.to);
  if (filters.event_type_id) q = q.eq('event_type_id', filters.event_type_id);
  if (filters.campus_id) q = q.eq('campus_id', filters.campus_id);
  if (filters.q) q = q.ilike('title', `%${filters.q.slice(0, 80).replace(/[%_]/g, '')}%`);
  return q as T;
}

function sortForHub(events: ViewerEvent[]): ViewerEvent[] {
  return events.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return a.starts_at.localeCompare(b.starts_at);
  });
}

/**
 * The authenticated hub query: every gathering at `churchId` in the window
 * that this user is entitled to see, enforced by RLS. Scoped to one church
 * so another church's public gatherings never mix into "my church" (Nearby
 * is a separate, explicit query).
 */
export async function listHubEvents(
  churchId: string,
  filters: EventListFilters,
): Promise<ViewerEvent[]> {
  const session = await getSession();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('church_id', churchId)
    .in('status', ['published', 'cancelled'])
    .order('starts_at', { ascending: true })
    .limit(500);

  query = applyFilters(query, filters);

  // Group filter: a join through event_audiences.
  if (filters.group_id) {
    const { data: ids } = await supabase
      .from('event_audiences')
      .select('event_id')
      .eq('group_id', filters.group_id);
    const eventIds = ((ids ?? []) as Array<{ event_id: string }>).map((r) => r.event_id);
    if (eventIds.length === 0) return [];
    query = query.in('id', eventIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load hub events: ${error.message}`);

  const rows = (data ?? []) as unknown as JoinedEventRow[];
  const ctx = await loadViewerContext(session, rows);
  return sortForHub(rows.map((r) => toViewerEvent(r, ctx)));
}

/** A host's own drafts, which never appear on the hub. */
export async function listMyDrafts(): Promise<ViewerEvent[]> {
  const session = await getSession();
  if (!session) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'draft')
    .or(`host_profile_id.eq.${session.id},cohost_profile_id.eq.${session.id}`)
    .order('starts_at', { ascending: true })
    .limit(50);
  const rows = (data ?? []) as unknown as JoinedEventRow[];
  const ctx = await loadViewerContext(session, rows);
  return rows.map((r) => toViewerEvent(r, ctx));
}

/**
 * The anonymous path — the one place with a second visibility query, and the
 * highest-value thing in this codebase to test.
 *
 * Service-role (an anonymous request has no `auth.uid()`) with an explicit,
 * hardcoded `visibility='public' AND status IN ('published','cancelled')`.
 * A public gathering's address is public. Rosters and host contact are not
 * part of ViewerEvent at all, and the host shows as a first name + initial.
 */
export async function listPublicEvents(
  churchId: string,
  filters: EventListFilters,
): Promise<ViewerEvent[]> {
  const admin = await createServiceRoleClient();

  let query = admin
    .from('events')
    .select(EVENT_SELECT)
    .eq('church_id', churchId)
    .eq('visibility', 'public')
    .in('status', ['published', 'cancelled'])
    .order('starts_at', { ascending: true })
    .limit(200);

  query = applyFilters(query, filters);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load public events: ${error.message}`);

  const rows = (data ?? []) as unknown as JoinedEventRow[];
  const ctx = await loadViewerContext(null, rows);
  return sortForHub(rows.map((r) => toViewerEvent(r, ctx)));
}

/**
 * Single event for the detail page. Returns null when the viewer isn't
 * entitled to it — RLS makes the row simply not exist for them (no
 * existence oracle).
 */
export const getEvent = cache(async (eventId: string): Promise<ViewerEvent | null> => {
  const session = await getSession();
  const supabase = session ? await createServerSupabaseClient() : await createServiceRoleClient();

  let query = supabase.from('events').select(EVENT_SELECT).eq('id', eventId);
  if (!session) {
    query = query.eq('visibility', 'public').in('status', ['published', 'cancelled']);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const row = data as unknown as JoinedEventRow;
  const ctx = await loadViewerContext(session, [row]);
  return toViewerEvent(row, ctx);
});

/** The raw row and address for the edit form. RLS-scoped. */
export async function getEventForEdit(
  eventId: string,
): Promise<{ row: EventRow; address: EventAddressRow | null; groupIds: string[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('events').select(EVENT_SELECT).eq('id', eventId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as JoinedEventRow;
  const { data: aud } = await supabase
    .from('event_audiences')
    .select('group_id, is_eligibility_ring')
    .eq('event_id', eventId);
  const groupIds = ((aud ?? []) as Array<{ group_id: string; is_eligibility_ring: boolean }>)
    .filter((a) => !a.is_eligibility_ring)
    .map((a) => a.group_id);
  return { row, address: row.address, groupIds };
}

/**
 * Who's coming, through the database's own projection (ec_event_attendees):
 * the host, cohost and staff get everyone who responded; a member going to
 * a private gathering gets the others who are going, as first name +
 * initial; everyone else gets nothing.
 */
export async function listEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const session = await getSession();
  if (!session) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('ec_event_attendees', { e_id: eventId });
  if (error) return [];
  return ((data ?? []) as EventAttendee[]).map((a) => ({
    ...a,
    guest_count: a.guest_count ?? 0,
  }));
}

/** Event types for the filter bar and the create form. */
export async function listEventTypes(churchId: string): Promise<EventType[]> {
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('event_types')
    .select('*')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('order_index');
  return (data ?? []) as EventType[];
}

/** Other gatherings in the same weekly series, for "this one or all future". */
export async function countFutureInSeries(seriesId: string, fromStartsAt: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('series_id', seriesId)
    .gte('starts_at', fromStartsAt)
    .in('status', ['published', 'draft']);
  return count ?? 0;
}
