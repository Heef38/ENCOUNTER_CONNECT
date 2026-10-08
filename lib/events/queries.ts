import 'server-only';

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession, type SessionUser } from '@/lib/auth/dal';
import type {
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
 * RLS SELECT policy is `ec_can_see_event(id)` (migration 027), so the database
 * itself decides what this user may see and forgetting a filter here is not
 * possible. Everything below is about *presentation* — time windows, sorting,
 * and the address-reveal gate.
 *
 * The anonymous path is the one exception and lives in `listPublicEvents`.
 */

const EVENT_SELECT = `
  *,
  event_type:event_types ( id, name, slug, color ),
  campus:campuses ( id, name ),
  host:profiles!events_host_profile_id_fkey ( id, first_name, last_name, email, phone )
`;

interface JoinedEventRow extends EventRow {
  event_type: { id: string; name: string; slug: string; color: string | null } | null;
  campus: { id: string; name: string } | null;
  host: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

/** Who is looking, and what they've earned. */
interface ViewerContext {
  profileId: string | null;
  isStaff: boolean;
  /** event_id -> the viewer's own RSVP status. */
  myRsvps: Map<string, RsvpStatus>;
  goingCounts: Map<string, number>;
}

function isStaffSession(session: SessionUser | null): boolean {
  if (!session?.profile) return false;
  if (session.profile.is_platform_admin) return true;
  return session.profile.role !== 'participant';
}

function formatAddress(e: EventRow): string | null {
  const parts = [e.address_line1, e.address_line2, e.city, e.region, e.postal_code]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** The always-safe location label: a venue name, or just the city. */
function locationLabel(e: EventRow): string | null {
  if (e.location_name?.trim()) return e.location_name.trim();
  if (e.city?.trim()) return e.city.trim();
  return null;
}

/**
 * THE address-reveal gate. Lives here, in the query layer, not in a template —
 * so a future map view, ICS export, or JSON feed cannot leak a home address by
 * forgetting to apply it.
 *
 * Rules:
 *   - A **public** event's address is public. That is what "public" means, and
 *     it is the right default for a church building or a park. The publish-time
 *     confirmation is what protects a host who marks their *home* public.
 *   - A **private** event with `hide_address_until_rsvp` withholds the street
 *     address until the viewer has RSVP'd. Host, cohost and staff always see it.
 */
function revealAddress(
  e: EventRow,
  viewer: ViewerContext,
  isHost: boolean,
): { address: string | null; hidden: boolean; lat: number | null; lng: number | null } {
  const full = formatAddress(e);
  if (!full) return { address: null, hidden: false, lat: e.lat, lng: e.lng };

  const gated =
    e.visibility === 'private' &&
    e.hide_address_until_rsvp &&
    !isHost &&
    !viewer.isStaff &&
    viewer.myRsvps.get(e.id) !== 'going' &&
    viewer.myRsvps.get(e.id) !== 'maybe';

  if (gated) {
    // Coordinates are withheld too — a precise pin is an address.
    return { address: null, hidden: true, lat: null, lng: null };
  }
  return { address: full, hidden: false, lat: e.lat, lng: e.lng };
}

function toViewerEvent(row: JoinedEventRow, viewer: ViewerContext): ViewerEvent {
  const isHost =
    viewer.profileId !== null &&
    (viewer.profileId === row.host_profile_id ||
      viewer.profileId === row.cohost_profile_id);

  const { address, hidden, lat, lng } = revealAddress(row, viewer, isHost);
  const hostName = row.host
    ? `${row.host.first_name} ${row.host.last_name}`.trim()
    : 'Someone at your church';

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    all_day: row.all_day,

    status: row.status,
    visibility: row.visibility,
    is_pinned: row.pinned_at !== null,

    event_type: row.event_type,
    campus: row.campus,

    host_name: hostName || 'Someone at your church',
    // Host contact is for signed-in people only, and only when they can act on
    // it. Anonymous viewers get the in-app "message the host" path instead, so
    // a member's mobile number never lands on the open internet.
    host_contact:
      viewer.profileId && row.host
        ? { email: row.host.email, phone: row.host.phone }
        : null,

    location_label: locationLabel(row),
    address,
    address_hidden_pending_rsvp: hidden,
    lat,
    lng,

    capacity: row.capacity,
    rsvp_required: row.rsvp_required,
    rsvp_deadline: row.rsvp_deadline,
    going_count: viewer.goingCounts.get(row.id) ?? 0,
    my_rsvp: viewer.myRsvps.get(row.id) ?? null,

    cancellation_reason: row.cancellation_reason,

    can_edit: isHost || viewer.isStaff,
    // You can report anything you can see, except your own event. RLS already
    // guarantees you can only see what you're entitled to.
    can_report: viewer.profileId !== null && !isHost && row.status === 'published',
    can_rsvp:
      viewer.profileId !== null &&
      row.status === 'published' &&
      (!row.rsvp_deadline || new Date(row.rsvp_deadline) > new Date()),
  };
}

/**
 * Loads the viewer's own RSVPs and the going-counts for a set of events.
 *
 * Counts come from a service-role query on purpose: the RSVP roster is not
 * readable by ordinary members (by design — who attends is the attendees'
 * information), but an aggregate count is safe and is what the UI shows.
 */
async function loadViewerContext(
  session: SessionUser | null,
  eventIds: string[],
): Promise<ViewerContext> {
  const ctx: ViewerContext = {
    profileId: session?.id ?? null,
    isStaff: isStaffSession(session),
    myRsvps: new Map(),
    goingCounts: new Map(),
  };

  if (eventIds.length === 0) return ctx;

  const admin = await createServiceRoleClient();
  const { data: rsvpRows } = await admin
    .from('event_rsvps')
    .select('event_id, profile_id, status, guest_count')
    .in('event_id', eventIds);

  for (const r of (rsvpRows ?? []) as Array<{
    event_id: string;
    profile_id: string;
    status: RsvpStatus;
    guest_count: number;
  }>) {
    if (r.status === 'going') {
      const prev = ctx.goingCounts.get(r.event_id) ?? 0;
      ctx.goingCounts.set(r.event_id, prev + 1 + (r.guest_count ?? 0));
    }
    if (ctx.profileId && r.profile_id === ctx.profileId) {
      ctx.myRsvps.set(r.event_id, r.status);
    }
  }

  return ctx;
}

function applyFilters<T>(query: T, filters: EventListFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;
  if (filters.from) q = q.gte('starts_at', filters.from);
  if (filters.to) q = q.lte('starts_at', filters.to);
  if (filters.event_type_id) q = q.eq('event_type_id', filters.event_type_id);
  if (filters.campus_id) q = q.eq('campus_id', filters.campus_id);
  if (filters.q) q = q.ilike('title', `%${filters.q}%`);
  return q as T;
}

/**
 * The authenticated hub query. Returns every event in the window that this
 * user is entitled to see — enforced by RLS, not by anything here.
 *
 * Pinned events sort first, then by start time.
 */
export async function listHubEvents(
  filters: EventListFilters,
): Promise<ViewerEvent[]> {
  const session = await getSession();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('events')
    .select(EVENT_SELECT)
    .in('status', ['published', 'cancelled'])
    .order('starts_at', { ascending: true })
    .limit(500);

  query = applyFilters(query, filters);

  // Group filter is a join through event_audiences, so it can't ride
  // applyFilters' column-level helpers.
  if (filters.group_id) {
    const admin = await createServiceRoleClient();
    const { data: ids } = await admin
      .from('event_audiences')
      .select('event_id')
      .eq('group_id', filters.group_id);
    const eventIds = ((ids ?? []) as Array<{ event_id: string }>).map((r) => r.event_id);
    if (eventIds.length === 0) return [];
    query = query.in('id', eventIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load hub events: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as JoinedEventRow[];
  const ctx = await loadViewerContext(
    session,
    rows.map((r) => r.id),
  );

  const mapped = rows.map((r) => toViewerEvent(r, ctx));
  return mapped.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return a.starts_at.localeCompare(b.starts_at);
  });
}

/**
 * The anonymous path — the one place with a second visibility query, and the
 * highest-value thing in this codebase to test.
 *
 * It runs as service-role (an anonymous request has no `auth.uid()`, so RLS
 * has nothing to key on) with an explicit, hardcoded
 * `visibility='public' AND status IN ('published','cancelled')`. Cancelled is
 * included deliberately: someone who saw the event yesterday is exactly who
 * needs to learn it's off.
 *
 * A public event is returned in full — address included, because that is what
 * public means. What is dropped: the RSVP roster (a count only) and the host's
 * contact details, since those are other people's information rather than the
 * event's.
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
  if (error) {
    throw new Error(`Failed to load public events: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as JoinedEventRow[];
  const ctx = await loadViewerContext(null, rows.map((r) => r.id));
  const mapped = rows.map((r) => toViewerEvent(r, ctx));

  return mapped.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return a.starts_at.localeCompare(b.starts_at);
  });
}

/**
 * Single event for the detail page. Returns null when the viewer isn't
 * entitled to it — RLS makes the row simply not exist for them, which is the
 * behavior we want (no existence oracle).
 */
export async function getEvent(eventId: string): Promise<ViewerEvent | null> {
  const session = await getSession();
  const supabase = session
    ? await createServerSupabaseClient()
    : await createServiceRoleClient();

  let query = supabase.from('events').select(EVENT_SELECT).eq('id', eventId);

  // No session: enforce public-only explicitly, mirroring listPublicEvents.
  if (!session) {
    query = query.eq('visibility', 'public').in('status', ['published', 'cancelled']);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const row = data as unknown as JoinedEventRow;
  const ctx = await loadViewerContext(session, [row.id]);
  return toViewerEvent(row, ctx);
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
  return ((data ?? []) as EventType[]);
}
