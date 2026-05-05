-- ============================================================
-- SCHEDULING CORE — Migration 001
-- Domain-neutral scheduling engine for reuse across projects.
-- First integration target: Encounter Connect
-- ============================================================

-- ─────────────────────────────────────────────
-- AUTH ROLE ASSUMPTION LAYER
-- The broader app owns the users/roles table.
-- We assume a profiles table with a role column
-- exists (or will exist) at integration time.
-- For standalone use, we create a minimal stub.
-- ─────────────────────────────────────────────
create table if not exists public.user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'participant'
               check (role in ('admin','manager','resource','participant')),
  display_name text,
  metadata   jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.user_profiles is
  'Minimal role stub. In Encounter Connect this will map to the full profile table.';

-- ─────────────────────────────────────────────
-- LOCATIONS
-- ─────────────────────────────────────────────
create table public.scheduling_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  address     text,
  timezone    text not null default 'America/Chicago',
  is_virtual  boolean not null default false,
  is_active   boolean not null default true,
  metadata    jsonb default '{}',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.scheduling_locations is
  'Physical or virtual locations. Maps to campus in Encounter Connect.';

-- ─────────────────────────────────────────────
-- RESOURCE GROUPS
-- Optional groupings (e.g. "Connector Team A")
-- ─────────────────────────────────────────────
create table public.scheduling_resource_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  location_id uuid references public.scheduling_locations(id),
  is_active   boolean not null default true,
  metadata    jsonb default '{}',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- RESOURCES
-- A person, room, or any schedulable asset.
-- In Encounter Connect: connector, class slot, room.
-- ─────────────────────────────────────────────
create type public.scheduling_resource_kind as enum (
  'person', 'room', 'equipment', 'class_slot', 'virtual', 'other'
);

create table public.scheduling_resources (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             public.scheduling_resource_kind not null default 'person',
  description      text,
  email            text,
  phone            text,
  timezone         text not null default 'America/Chicago',
  location_id      uuid references public.scheduling_locations(id),
  group_id         uuid references public.scheduling_resource_groups(id),
  -- The user_id links a resource to an auth user (e.g. a connector who self-manages availability).
  user_id          uuid references auth.users(id),
  default_capacity int not null default 1 check (default_capacity >= 1),
  is_active        boolean not null default true,
  metadata         jsonb default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.scheduling_resources is
  'Schedulable assets. In Encounter Connect: connectors map here via user_id.';

-- ─────────────────────────────────────────────
-- APPOINTMENT TYPES
-- ─────────────────────────────────────────────
create type public.scheduling_location_mode as enum (
  'in_person', 'phone', 'video', 'hybrid', 'custom'
);

create table public.scheduling_appointment_types (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text unique,
  description              text,
  duration_minutes         int not null default 60 check (duration_minutes > 0),
  buffer_before_minutes    int not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes     int not null default 0 check (buffer_after_minutes >= 0),
  -- How far in advance a booking can be made (null = no limit)
  min_notice_hours         int default 24,
  -- How far in the future a slot can be booked (null = no limit)
  max_advance_days         int default 90,
  -- Hours before start within which cancellation is blocked
  cancellation_cutoff_hours int default 24,
  max_attendees            int not null default 1 check (max_attendees >= 1),
  requires_confirmation    boolean not null default false,
  location_mode            public.scheduling_location_mode not null default 'in_person',
  is_active                boolean not null default true,
  is_public                boolean not null default true,
  metadata                 jsonb default '{}',
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
comment on table public.scheduling_appointment_types is
  'Reusable appointment configurations. Examples: 1-on-1 meeting, class session, care call.';

-- Many appointment types can be fulfilled by many resources
create table public.scheduling_appointment_type_resource_map (
  appointment_type_id uuid not null references public.scheduling_appointment_types(id) on delete cascade,
  resource_id         uuid not null references public.scheduling_resources(id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (appointment_type_id, resource_id)
);

-- ─────────────────────────────────────────────
-- AVAILABILITY RULES
-- Recurring weekly availability per resource (and optionally per appt type).
-- ─────────────────────────────────────────────
create table public.scheduling_availability_rules (
  id                  uuid primary key default gen_random_uuid(),
  resource_id         uuid not null references public.scheduling_resources(id) on delete cascade,
  -- Optional scoping: rule applies only when booking this appointment type
  appointment_type_id uuid references public.scheduling_appointment_types(id),
  -- 0=Sunday … 6=Saturday (ISO: 1=Monday … 7=Sunday also common; we use JS convention 0-6)
  day_of_week         int not null check (day_of_week between 0 and 6),
  start_time          time not null,
  end_time            time not null,
  -- Date range this rule is effective (null = unbounded)
  effective_from      date,
  effective_until     date,
  timezone            text not null default 'America/Chicago',
  is_active           boolean not null default true,
  metadata            jsonb default '{}',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_times check (end_time > start_time)
);
comment on table public.scheduling_availability_rules is
  'Recurring weekly windows. The slot engine reads these to generate candidate slots.';

-- ─────────────────────────────────────────────
-- BLACKOUTS / EXCEPTIONS
-- Overrides that mark a resource (or location) unavailable.
-- ─────────────────────────────────────────────
create type public.scheduling_blackout_scope as enum (
  'resource', 'location', 'global'
);

create table public.scheduling_blackouts (
  id          uuid primary key default gen_random_uuid(),
  scope       public.scheduling_blackout_scope not null default 'resource',
  -- Exactly one of resource_id / location_id should be set (or neither for global)
  resource_id uuid references public.scheduling_resources(id) on delete cascade,
  location_id uuid references public.scheduling_locations(id) on delete cascade,
  title       text not null,
  reason      text,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  is_active   boolean not null default true,
  metadata    jsonb default '{}',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_blackout_range check (ends_at > starts_at)
);
comment on table public.scheduling_blackouts is
  'Point-in-time overrides: PTO, holiday closures, room maintenance, etc.';

-- ─────────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────────
create type public.scheduling_booking_status as enum (
  'draft',
  'pending_confirmation',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'
);

create table public.scheduling_bookings (
  id                  uuid primary key default gen_random_uuid(),
  appointment_type_id uuid not null references public.scheduling_appointment_types(id),
  resource_id         uuid references public.scheduling_resources(id),
  location_id         uuid references public.scheduling_locations(id),
  title               text,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  timezone            text not null default 'America/Chicago',
  status              public.scheduling_booking_status not null default 'pending_confirmation',
  notes               text,
  cancellation_reason text,
  -- The user who created the booking (could be participant, admin, etc.)
  booked_by           uuid references auth.users(id),
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  completed_at        timestamptz,
  metadata            jsonb default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint chk_booking_range check (ends_at > starts_at)
);
comment on table public.scheduling_bookings is
  'Core booking record. Domain-neutral. Encounter Connect attaches context via external_refs.';

-- ─────────────────────────────────────────────
-- BOOKING ATTENDEES
-- ─────────────────────────────────────────────
create type public.scheduling_attendee_role as enum (
  'primary', 'secondary', 'observer', 'resource_person'
);

create table public.scheduling_booking_attendees (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.scheduling_bookings(id) on delete cascade,
  -- user_id is nullable; external parties may not have an account yet
  user_id       uuid references auth.users(id),
  role          public.scheduling_attendee_role not null default 'primary',
  display_name  text not null,
  email         text,
  phone         text,
  attended      boolean,
  attended_at   timestamptz,
  notes         text,
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- BOOKING STATUS HISTORY
-- ─────────────────────────────────────────────
create table public.scheduling_booking_status_history (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.scheduling_bookings(id) on delete cascade,
  from_status public.scheduling_booking_status,
  to_status   public.scheduling_booking_status not null,
  changed_by  uuid references auth.users(id),
  reason      text,
  metadata    jsonb default '{}',
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- OUTCOMES
-- Post-booking resolution. Key for Encounter Connect progression.
-- ─────────────────────────────────────────────
create type public.scheduling_outcome_kind as enum (
  'completed_successfully',
  'follow_up_required',
  'no_show',
  'needs_reassignment',
  'next_action_recommended',
  'cancelled_by_participant',
  'cancelled_by_resource',
  'other'
);

create table public.scheduling_outcomes (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.scheduling_bookings(id) on delete cascade,
  kind           public.scheduling_outcome_kind not null,
  summary        text,
  next_action    text,
  -- Optional link to a follow-up booking
  followup_booking_id uuid references public.scheduling_bookings(id),
  recorded_by    uuid references auth.users(id),
  metadata       jsonb default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.scheduling_outcomes is
  'Post-booking outcomes. Encounter Connect reads these to advance workflow steps.';

-- ─────────────────────────────────────────────
-- EXTERNAL REFERENCES
-- The critical bridge to Encounter Connect (and future platforms).
-- ─────────────────────────────────────────────
create type public.scheduling_ref_relation_kind as enum (
  'primary_subject',
  'workflow_gate',
  'linked_context',
  'assigned_resource',
  'reporting_target'
);

create table public.scheduling_external_refs (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.scheduling_bookings(id) on delete cascade,
  -- e.g. 'encounter_participant', 'encounter_workflow_step', 'encounter_connector_assignment'
  external_type text not null,
  -- The ID in the external system
  external_id   text not null,
  relation_kind public.scheduling_ref_relation_kind not null default 'primary_subject',
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.scheduling_external_refs is
  'Links bookings to external domain entities without coupling the core schema. '
  'This is how Encounter Connect attaches participants and workflow steps.';

create index idx_external_refs_type_id on public.scheduling_external_refs (external_type, external_id);
create index idx_external_refs_booking on public.scheduling_external_refs (booking_id);

-- ─────────────────────────────────────────────
-- REMINDERS
-- ─────────────────────────────────────────────
create type public.scheduling_reminder_channel as enum (
  'email', 'sms', 'push', 'in_app', 'webhook'
);

create type public.scheduling_reminder_status as enum (
  'pending', 'sent', 'failed', 'cancelled', 'skipped'
);

create table public.scheduling_reminders (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.scheduling_bookings(id) on delete cascade,
  channel       public.scheduling_reminder_channel not null default 'email',
  -- How many minutes before the booking this should fire
  offset_minutes int not null default 1440,
  scheduled_for  timestamptz not null,
  status         public.scheduling_reminder_status not null default 'pending',
  sent_at        timestamptz,
  -- The resolved recipient address (email / phone)
  recipient      text,
  metadata       jsonb default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- NOTIFICATION LOG
-- Immutable delivery record for audit.
-- ─────────────────────────────────────────────
create table public.scheduling_notification_log (
  id           uuid primary key default gen_random_uuid(),
  reminder_id  uuid references public.scheduling_reminders(id),
  booking_id   uuid references public.scheduling_bookings(id),
  channel      public.scheduling_reminder_channel not null,
  recipient    text,
  subject      text,
  body_preview text,
  status       text not null default 'sent',
  provider     text,
  provider_ref text,
  error_detail text,
  sent_at      timestamptz not null default now()
);
comment on table public.scheduling_notification_log is
  'Immutable delivery log. Placeholder providers can write here.';

-- ─────────────────────────────────────────────
-- TAGS  (optional support table)
-- ─────────────────────────────────────────────
create table public.scheduling_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  color      text,
  created_at timestamptz not null default now()
);

create table public.scheduling_booking_tags (
  booking_id uuid not null references public.scheduling_bookings(id) on delete cascade,
  tag_id     uuid not null references public.scheduling_tags(id) on delete cascade,
  primary key (booking_id, tag_id)
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
create index idx_bookings_resource_time     on public.scheduling_bookings (resource_id, starts_at, ends_at);
create index idx_bookings_status            on public.scheduling_bookings (status);
create index idx_bookings_appt_type         on public.scheduling_bookings (appointment_type_id);
create index idx_bookings_starts_at         on public.scheduling_bookings (starts_at);
create index idx_availability_resource_day  on public.scheduling_availability_rules (resource_id, day_of_week);
create index idx_blackouts_resource_range   on public.scheduling_blackouts (resource_id, starts_at, ends_at);
create index idx_reminders_scheduled        on public.scheduling_reminders (scheduled_for, status);
create index idx_attendees_booking          on public.scheduling_booking_attendees (booking_id);
create index idx_attendees_user             on public.scheduling_booking_attendees (user_id);
create index idx_status_history_booking     on public.scheduling_booking_status_history (booking_id);

-- ─────────────────────────────────────────────
-- updated_at TRIGGERS
-- ─────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_profiles',
    'scheduling_locations',
    'scheduling_resource_groups',
    'scheduling_resources',
    'scheduling_appointment_types',
    'scheduling_availability_rules',
    'scheduling_blackouts',
    'scheduling_bookings',
    'scheduling_booking_attendees',
    'scheduling_outcomes',
    'scheduling_external_refs',
    'scheduling_reminders'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%s '
      'for each row execute function public.handle_updated_at()',
      t, t
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────
-- AUTO STATUS HISTORY
-- Automatically log booking status changes.
-- ─────────────────────────────────────────────
create or replace function public.log_booking_status_change()
returns trigger language plpgsql security definer as $$
begin
  if (old.status is distinct from new.status) then
    insert into public.scheduling_booking_status_history
      (booking_id, from_status, to_status, changed_by)
    values
      (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_booking_status_history
after update on public.scheduling_bookings
for each row execute function public.log_booking_status_change();
