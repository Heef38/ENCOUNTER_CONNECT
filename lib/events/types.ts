import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Enums (mirror migration 027) ──────────────────────────────

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'hidden';

/** Binary by design. See docs/connection-hub-plan.md §4. */
export type EventVisibility = 'public' | 'private';

export type EventChannel = 'web' | 'sms' | 'admin';

/** WHO GETS NOTIFIED — a different question from visibility (WHO CAN SEE). */
export type InviteRing = 'members_only' | 'members_plus_eligible' | 'church_wide';

export type RsvpStatus = 'going' | 'maybe' | 'not_going' | 'waitlist';

/**
 * Where a gathering happens. Anything that is not affirmatively a campus or
 * a public place is someone's home: never geocoded, never sharper on a map
 * than its campus pin, and its address held until RSVP when private.
 */
export type VenueKind = 'campus' | 'public_place' | 'home' | 'online';

export type EventCategory = 'gathering' | 'prayer' | 'study' | 'serve' | 'youth' | 'outreach' | 'other';

export type ReportReason =
  | 'not_legitimate'
  | 'inappropriate'
  | 'wrong_details'
  | 'safety_concern'
  | 'spam'
  | 'other';

export type ReportResolution = 'restored' | 'cancelled' | 'host_blocked' | 'no_action';

export type GroupKind =
  | 'roster'
  | 'ministry'
  | 'home_group'
  | 'age_stage'
  | 'interest'
  | 'serve'
  | 'custom';

export type GroupMemberRole = 'member' | 'leader';

// ── Rows ──────────────────────────────────────────────────────

export interface EventType {
  id: string;
  church_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  default_visibility: EventVisibility;
  default_venue_kind: VenueKind;
  category: EventCategory;
  is_active: boolean;
  order_index: number;
}

export interface EventRow {
  id: string;
  church_id: string;
  campus_id: string | null;
  event_type_id: string;

  title: string;
  description: string | null;

  starts_at: string;
  ends_at: string;
  timezone: string;
  all_day: boolean;
  series_id: string | null;
  series_index: number | null;

  visibility: EventVisibility;
  audience_is_church_wide: boolean;
  invite_ring: InviteRing;
  status: EventStatus;

  /** Null when the host's account was deleted. */
  host_profile_id: string | null;
  cohost_profile_id: string | null;

  venue_kind: VenueKind;
  /** Generated: venue_kind = 'home'. */
  is_private_residence: boolean;
  location_name: string | null;
  city: string | null;
  region: string | null;
  /** Map-safe coordinates, derived by the database (migration 033). */
  public_lat: number | null;
  public_lng: number | null;
  hide_address_until_rsvp: boolean;
  public_home_acknowledged_at: string | null;

  scheduling_location_id: string | null;
  scheduling_booking_id: string | null;

  capacity: number | null;
  rsvp_required: boolean;
  rsvp_deadline: string | null;
  image_url: string | null;

  pinned_at: string | null;
  pinned_by_profile_id: string | null;

  published_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cancelled_by_profile_id: string | null;
  hidden_at: string | null;
  hidden_reason: string | null;

  created_by_channel: EventChannel;
  inbound_message_id: string | null;

  created_at: string;
  updated_at: string;
}

/** The street address and exact pin, behind ec_can_see_event_address. */
export interface EventAddressRow {
  event_id: string;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
}

/**
 * An event as it is safe to render to a particular viewer.
 *
 * Nothing private reaches this shape by accident: the street address comes
 * through event_addresses RLS (the database decides) and is then passed
 * through revealAddress() in queries.ts, which mirrors the same rule.
 * There is deliberately no host contact field — contact runs through the
 * in-app "message the host" relay — so a map, feed or ICS export built on
 * this type cannot leak a member's phone number.
 */
export interface ViewerEvent {
  id: string;
  church_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  all_day: boolean;
  series_id: string | null;

  status: EventStatus;
  visibility: EventVisibility;
  venue_kind: VenueKind;
  is_pinned: boolean;

  event_type: Pick<EventType, 'id' | 'name' | 'slug' | 'color'> | null;
  campus: { id: string; name: string } | null;

  /** Full name for signed-in members of the church; first name + initial otherwise. */
  host_name: string;

  /** Always safe to show: a place name and the city. */
  location_label: string | null;
  /** Full street address, or null when the gate withheld it. */
  address: string | null;
  /** True when an address exists but this viewer hasn't earned it yet. */
  address_hidden_pending_rsvp: boolean;
  /** The pin to draw on a map. Never sharper than this page. */
  map_lat: number | null;
  map_lng: number | null;
  /** The exact venue pin, only alongside a revealed address (detail mini-map). */
  exact_lat: number | null;
  exact_lng: number | null;

  capacity: number | null;
  rsvp_required: boolean;
  rsvp_deadline: string | null;
  going_count: number;
  /** The viewer's own RSVP, if any. Never other people's. */
  my_rsvp: RsvpStatus | null;
  my_guest_count: number;

  cancellation_reason: string | null;

  /** Viewer capabilities, resolved server-side so the UI never guesses. */
  is_host: boolean;
  can_edit: boolean;
  can_report: boolean;
  can_rsvp: boolean;
  can_check_in: boolean;
  can_pin: boolean;
  can_message_host: boolean;
}

export interface GroupRow {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  slug: string | null;
  kind: GroupKind;
  description: string | null;
  parent_group_id: string | null;
  is_private: boolean;
  is_youth: boolean;
  leader_profile_id: string | null;
  serve_team_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupWithCounts extends GroupRow {
  member_count: number;
  parent_name: string | null;
  is_member: boolean;
}

// ── Inputs ────────────────────────────────────────────────────

/**
 * What the create and edit forms send. Times are wall-clock values in the
 * church's timezone (the server converts), so a host on a laptop set to
 * another zone still creates a 7pm gathering at 7pm.
 */
export interface EventInput {
  event_type_id: string;
  title: string;
  description?: string;
  /** 'YYYY-MM-DD' in the church's timezone. */
  date: string;
  /** 'HH:mm' in the church's timezone. */
  start_time: string;
  end_time: string;
  campus_id?: string | null;

  visibility: EventVisibility;
  /** Explicit "everyone at my church". Never inferred from an empty audience. */
  audience_is_church_wide?: boolean;
  /** Targeted groups. Required for a private event unless church-wide. */
  group_ids?: string[];
  invite_ring?: InviteRing;
  invite_profile_ids?: string[];

  venue_kind: VenueKind;
  location_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  /** Private public-place gatherings may hold the address; private homes always do. */
  hide_address_until_rsvp?: boolean;
  /** The host's plain-language confirmation for a public home gathering. */
  acknowledged_public_home?: boolean;

  capacity?: number | null;
  rsvp_required?: boolean;

  /** Create only: repeat weekly for this many weeks in total (1 = once). */
  repeat_weeks?: number;
  /** Publish immediately, or leave as a draft. */
  publish?: boolean;
}

export interface EventListFilters {
  from?: string;
  to?: string;
  event_type_id?: string;
  campus_id?: string;
  group_id?: string;
  q?: string;
}

export interface EventAttendee {
  profile_id: string;
  first_name: string;
  last_name: string | null;
  status: RsvpStatus;
  guest_count: number;
  attended_at: string | null;
}

// ── Audience preview ──────────────────────────────────────────

/**
 * What a host sees before publishing: counts only, never a roster. The host
 * gets to know how far their message reaches without being handed a directory.
 */
export interface AudiencePreview {
  total: number;
  by_email: number;
  by_sms: number;
  /** Reachable people we will not text: no consent on file, or no number. */
  skipped_no_consent: number;
  skipped_no_contact: number;
  /** Group names included, for a human-readable "this goes to …" line. */
  group_names: string[];
  /** True when the eligibility ring widened the audience beyond the target. */
  includes_eligibility_ring: boolean;
  /** Set when the per-host daily cap would clip this send. */
  over_daily_cap_by: number;
}
