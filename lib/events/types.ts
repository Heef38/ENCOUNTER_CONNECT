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
  default_is_private_residence: boolean;
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
  recurrence_rule: string | null;

  visibility: EventVisibility;
  audience_is_church_wide: boolean;
  invite_ring: InviteRing;
  status: EventStatus;

  host_profile_id: string;
  cohost_profile_id: string | null;

  location_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  is_private_residence: boolean;
  hide_address_until_rsvp: boolean;

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

/**
 * An event as it is safe to render to a particular viewer.
 *
 * The address fields are **deliberately not** the raw columns. `toViewerEvent`
 * in queries.ts is the only place that decides whether a viewer gets the street
 * address or just the neighborhood, and it returns this shape so a future map
 * view, ICS export, or JSON feed physically cannot leak an address by
 * forgetting to apply the rule.
 */
export interface ViewerEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  all_day: boolean;

  status: EventStatus;
  visibility: EventVisibility;
  is_pinned: boolean;

  event_type: Pick<EventType, 'id' | 'name' | 'slug' | 'color'> | null;
  campus: { id: string; name: string } | null;

  host_name: string;
  /** Host contact is never included for anonymous viewers — see §8. */
  host_contact: { email: string | null; phone: string | null } | null;

  /** Always safe to show: a human label like "Midtown" or "Grace Chapel". */
  location_label: string | null;
  /** Full street address, or null when the reveal gate withheld it. */
  address: string | null;
  /** True when an address exists but this viewer hasn't earned it yet. */
  address_hidden_pending_rsvp: boolean;
  lat: number | null;
  lng: number | null;

  capacity: number | null;
  rsvp_required: boolean;
  rsvp_deadline: string | null;
  going_count: number;
  /** The viewer's own RSVP, if any. Never other people's. */
  my_rsvp: RsvpStatus | null;

  cancellation_reason: string | null;

  /** Viewer capabilities, resolved server-side so the UI never guesses. */
  can_edit: boolean;
  can_report: boolean;
  can_rsvp: boolean;
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

export interface CreateEventInput {
  event_type_id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  all_day?: boolean;
  campus_id?: string | null;

  visibility: EventVisibility;
  /** Explicit "everyone at my church". Never inferred from an empty audience. */
  audience_is_church_wide?: boolean;
  /** Targeted groups. Required for a private event unless church-wide. */
  group_ids?: string[];
  invite_ring?: InviteRing;
  invite_profile_ids?: string[];

  location_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  is_private_residence?: boolean;
  hide_address_until_rsvp?: boolean;
  scheduling_location_id?: string | null;

  capacity?: number | null;
  rsvp_required?: boolean;
  rsvp_deadline?: string | null;
  image_url?: string;

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
