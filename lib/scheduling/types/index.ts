// ============================================================
// SCHEDULING CORE — TypeScript Types
// Domain-neutral. No Encounter Connect references here.
// REUSABLE CORE — safe to extract into a shared package.
// ============================================================

// ─────────────────────────────────────────────
// ENUMS (mirrors DB enums)
// ─────────────────────────────────────────────

export type SchedulingResourceKind =
  | 'person'
  | 'room'
  | 'equipment'
  | 'class_slot'
  | 'virtual'
  | 'other';

export type SchedulingLocationMode =
  | 'in_person'
  | 'phone'
  | 'video'
  | 'hybrid'
  | 'custom';

export type SchedulingAvailabilityRuleType = 'recurring' | 'date_specific';

export type SchedulingBlackoutScope = 'resource' | 'location' | 'global';

export type SchedulingBookingStatus =
  | 'draft'
  | 'pending_confirmation'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type SchedulingAttendeeRole =
  | 'primary'
  | 'secondary'
  | 'observer'
  | 'resource_person';

export type SchedulingOutcomeKind =
  | 'completed_successfully'
  | 'follow_up_required'
  | 'no_show'
  | 'needs_reassignment'
  | 'next_action_recommended'
  | 'cancelled_by_participant'
  | 'cancelled_by_resource'
  | 'other';

export type SchedulingRefRelationKind =
  | 'primary_subject'
  | 'workflow_gate'
  | 'linked_context'
  | 'assigned_resource'
  | 'reporting_target';

export type SchedulingReminderChannel =
  | 'email'
  | 'sms'
  | 'push'
  | 'in_app'
  | 'webhook';

export type SchedulingReminderStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type UserRole = 'admin' | 'manager' | 'resource' | 'participant';

// ─────────────────────────────────────────────
// BASE
// ─────────────────────────────────────────────

export interface BaseRecord {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface BaseRecordWithCreator extends BaseRecord {
  created_by: string | null;
}

// ─────────────────────────────────────────────
// USER PROFILES (auth integration stub)
// ─────────────────────────────────────────────

export interface UserProfile {
  id: string;
  role: UserRole;
  display_name: string | null;
  manager_location_id: string | null; // when set, scopes manager to one location
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────

export interface SchedulingLocation extends BaseRecordWithCreator {
  name: string;
  description: string | null;
  address: string | null;
  timezone: string;
  is_virtual: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateLocationInput {
  name: string;
  description?: string;
  address?: string;
  timezone?: string;
  is_virtual?: boolean;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// RESOURCE GROUPS
// ─────────────────────────────────────────────

export interface SchedulingResourceGroup extends BaseRecordWithCreator {
  name: string;
  description: string | null;
  location_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// RESOURCES
// ─────────────────────────────────────────────

export interface SchedulingResource extends BaseRecordWithCreator {
  name: string;
  kind: SchedulingResourceKind;
  description: string | null;
  email: string | null;
  phone: string | null;
  timezone: string;
  location_id: string | null;
  group_id: string | null;
  user_id: string | null;
  default_capacity: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateResourceInput {
  name: string;
  kind?: SchedulingResourceKind;
  description?: string;
  email?: string;
  phone?: string;
  timezone?: string;
  location_id?: string;
  group_id?: string;
  user_id?: string;
  default_capacity?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateResourceInput extends Partial<CreateResourceInput> {
  is_active?: boolean;
}

// ─────────────────────────────────────────────
// APPOINTMENT TYPES
// ─────────────────────────────────────────────

export interface SchedulingAppointmentType extends BaseRecordWithCreator {
  name: string;
  slug: string | null;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_hours: number | null;
  max_advance_days: number | null;
  cancellation_cutoff_hours: number | null;
  max_attendees: number;
  requires_confirmation: boolean;
  location_mode: SchedulingLocationMode;
  is_active: boolean;
  is_public: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateAppointmentTypeInput {
  name: string;
  slug?: string;
  description?: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_notice_hours?: number;
  max_advance_days?: number;
  cancellation_cutoff_hours?: number;
  max_attendees?: number;
  requires_confirmation?: boolean;
  location_mode?: SchedulingLocationMode;
  is_public?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateAppointmentTypeInput extends Partial<CreateAppointmentTypeInput> {
  is_active?: boolean;
}

// ─────────────────────────────────────────────
// AVAILABILITY RULES
// ─────────────────────────────────────────────

export interface SchedulingAvailabilityRule extends BaseRecordWithCreator {
  resource_id: string;
  appointment_type_id: string | null;
  rule_type: SchedulingAvailabilityRuleType;
  day_of_week: number | null; // 0=Sun…6=Sat; null for date_specific rules
  start_time: string;         // HH:MM:SS
  end_time: string;
  effective_from: string | null;
  effective_until: string | null;
  timezone: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateAvailabilityRuleInput {
  resource_id: string;
  appointment_type_id?: string;
  rule_type?: SchedulingAvailabilityRuleType;
  // Required for recurring rules
  day_of_week?: number;
  start_time: string;
  end_time: string;
  // Required for date_specific rules (and optional date-range for recurring)
  effective_from?: string;
  effective_until?: string;
  timezone?: string;
}

// ─────────────────────────────────────────────
// BLACKOUTS
// ─────────────────────────────────────────────

export interface SchedulingBlackout extends BaseRecordWithCreator {
  scope: SchedulingBlackoutScope;
  resource_id: string | null;
  location_id: string | null;
  title: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface CreateBlackoutInput {
  scope?: SchedulingBlackoutScope;
  resource_id?: string;
  location_id?: string;
  title: string;
  reason?: string;
  starts_at: string;
  ends_at: string;
}

// ─────────────────────────────────────────────
// BOOKINGS
// ─────────────────────────────────────────────

export interface SchedulingBooking extends BaseRecord {
  appointment_type_id: string;
  resource_id: string | null;
  location_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: SchedulingBookingStatus;
  notes: string | null;
  cancellation_reason: string | null;
  booked_by: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateBookingInput {
  appointment_type_id: string;
  resource_id?: string;
  location_id?: string;
  title?: string;
  starts_at: string;
  timezone?: string;
  notes?: string;
  attendees?: CreateAttendeeInput[];
  external_refs?: CreateExternalRefInput[];
  metadata?: Record<string, unknown>;
}

export interface RescheduleBookingInput {
  booking_id: string;
  starts_at: string;
  notes?: string;
}

// ─────────────────────────────────────────────
// BOOKING ATTENDEES
// ─────────────────────────────────────────────

export interface SchedulingBookingAttendee extends BaseRecord {
  booking_id: string;
  user_id: string | null;
  role: SchedulingAttendeeRole;
  display_name: string;
  email: string | null;
  phone: string | null;
  attended: boolean | null;
  attended_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateAttendeeInput {
  user_id?: string;
  role?: SchedulingAttendeeRole;
  display_name: string;
  email?: string;
  phone?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// BOOKING STATUS HISTORY
// ─────────────────────────────────────────────

export interface SchedulingBookingStatusHistory {
  id: string;
  booking_id: string;
  from_status: SchedulingBookingStatus | null;
  to_status: SchedulingBookingStatus;
  changed_by: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─────────────────────────────────────────────
// OUTCOMES
// ─────────────────────────────────────────────

export interface SchedulingOutcome extends BaseRecord {
  booking_id: string;
  kind: SchedulingOutcomeKind;
  summary: string | null;
  next_action: string | null;
  followup_booking_id: string | null;
  recorded_by: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateOutcomeInput {
  booking_id: string;
  kind: SchedulingOutcomeKind;
  summary?: string;
  next_action?: string;
  followup_booking_id?: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// EXTERNAL REFERENCES
// ─────────────────────────────────────────────

export interface SchedulingExternalRef extends BaseRecord {
  booking_id: string;
  external_type: string;
  external_id: string;
  relation_kind: SchedulingRefRelationKind;
  metadata: Record<string, unknown>;
}

export interface CreateExternalRefInput {
  external_type: string;
  external_id: string;
  relation_kind?: SchedulingRefRelationKind;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────────

export interface SchedulingReminder extends BaseRecord {
  booking_id: string;
  channel: SchedulingReminderChannel;
  offset_minutes: number;
  scheduled_for: string;
  status: SchedulingReminderStatus;
  sent_at: string | null;
  recipient: string | null;
  metadata: Record<string, unknown>;
}

export interface CreateReminderInput {
  booking_id: string;
  channel?: SchedulingReminderChannel;
  offset_minutes?: number;
  recipient?: string;
}

// ─────────────────────────────────────────────
// NOTIFICATION LOG
// ─────────────────────────────────────────────

export interface SchedulingNotificationLog {
  id: string;
  reminder_id: string | null;
  booking_id: string | null;
  channel: SchedulingReminderChannel;
  recipient: string | null;
  subject: string | null;
  body_preview: string | null;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  error_detail: string | null;
  sent_at: string;
}

// ─────────────────────────────────────────────
// SLOT ENGINE TYPES
// ─────────────────────────────────────────────

export interface TimeSlot {
  starts_at: Date;
  ends_at: Date;
  resource_id: string;
  available: boolean;
  capacity_remaining: number;
}

export interface GetAvailableSlotsInput {
  appointment_type_id: string;
  resource_id?: string;       // if omitted, check all capable resources
  date_from: Date;
  date_to: Date;
  timezone?: string;
}

// ─────────────────────────────────────────────
// RICH / JOINED TYPES (for UI convenience)
// ─────────────────────────────────────────────

export interface BookingWithRelations extends SchedulingBooking {
  appointment_type: SchedulingAppointmentType | null;
  resource: SchedulingResource | null;
  location: SchedulingLocation | null;
  attendees: SchedulingBookingAttendee[];
  status_history: SchedulingBookingStatusHistory[];
  outcome: SchedulingOutcome | null;
  external_refs: SchedulingExternalRef[];
  reminders: SchedulingReminder[];
}

export interface ResourceWithAvailability extends SchedulingResource {
  availability_rules: SchedulingAvailabilityRule[];
  blackouts: SchedulingBlackout[];
  location: SchedulingLocation | null;
  group: SchedulingResourceGroup | null;
}

// ─────────────────────────────────────────────
// FILTER / QUERY TYPES
// ─────────────────────────────────────────────

export interface ListBookingsFilter {
  status?: SchedulingBookingStatus | SchedulingBookingStatus[];
  resource_id?: string;
  appointment_type_id?: string;
  booked_by?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface ListResourcesFilter {
  kind?: SchedulingResourceKind;
  location_id?: string;
  group_id?: string;
  is_active?: boolean;
}

// ─────────────────────────────────────────────
// SERVICE RESULT WRAPPER
// ─────────────────────────────────────────────

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
