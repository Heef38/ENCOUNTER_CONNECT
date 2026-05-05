-- ============================================================
-- SCHEDULING CORE — Migration 003: Enhancements
--   1. user_profiles auto-create trigger
--   2. campus-scoped manager support
--   3. availability rule_type (recurring vs date_specific)
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. USER PROFILES AUTO-CREATE TRIGGER
-- Fires after every new auth.users row is inserted.
-- New users start as 'participant'; roles are elevated manually.
-- ─────────────────────────────────────────────
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, role, display_name)
  values (
    new.id,
    'participant',
    coalesce(new.raw_user_meta_data->>'display_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Drop if it already exists (idempotent)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

comment on function public.handle_new_auth_user is
  'Auto-creates a user_profiles row for every new Supabase auth user. '
  'Default role is participant. Admins promote as needed.';

-- ─────────────────────────────────────────────
-- 2. CAMPUS-SCOPED MANAGER SUPPORT
-- Add manager_location_id to user_profiles.
-- When NULL  → full access (super-manager / admin).
-- When set   → manager is scoped to that location only.
-- ─────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists manager_location_id uuid
    references public.scheduling_locations(id) on delete set null;

comment on column public.user_profiles.manager_location_id is
  'When set on a manager, restricts their access to resources/bookings '
  'at that location only. NULL = unscoped (sees everything).';

-- Helper: returns the current manager''s location scope (null = unscoped).
create or replace function public.scheduling_manager_location_id()
returns uuid language sql stable security definer as $$
  select manager_location_id
  from public.user_profiles
  where id = auth.uid();
$$;

-- Drop the old broad manager policies and replace with scoped versions.
-- We only need to update tables that are location-aware.

-- scheduling_resources
drop policy if exists "managers+ can manage resources" on public.scheduling_resources;
drop policy if exists "anyone authenticated can view active resources" on public.scheduling_resources;

create policy "anyone authenticated can view active resources"
  on public.scheduling_resources for select
  using (auth.uid() is not null and is_active = true);

create policy "managers+ can manage resources"
  on public.scheduling_resources for all
  using (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or location_id = public.scheduling_manager_location_id()
      or location_id is null
    )
  )
  with check (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or location_id = public.scheduling_manager_location_id()
      or location_id is null
    )
  );

-- scheduling_availability_rules (scoped via resource → location)
drop policy if exists "managers+ can manage all availability rules" on public.scheduling_availability_rules;
drop policy if exists "managers+ can view all availability rules" on public.scheduling_availability_rules;

create policy "managers+ can view all availability rules"
  on public.scheduling_availability_rules for select
  using (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
           or location_id is null
      )
    )
  );

create policy "managers+ can manage all availability rules"
  on public.scheduling_availability_rules for all
  using (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
           or location_id is null
      )
    )
  )
  with check (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
           or location_id is null
      )
    )
  );

-- scheduling_bookings (scoped via resource → location)
drop policy if exists "managers+ can view all bookings" on public.scheduling_bookings;
drop policy if exists "managers+ can manage all bookings" on public.scheduling_bookings;

create policy "managers+ can view all bookings"
  on public.scheduling_bookings for select
  using (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or location_id = public.scheduling_manager_location_id()
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
      )
    )
  );

create policy "managers+ can manage all bookings"
  on public.scheduling_bookings for all
  using (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or location_id = public.scheduling_manager_location_id()
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
      )
    )
  )
  with check (
    public.scheduling_has_role('manager') and (
      public.scheduling_manager_location_id() is null
      or location_id = public.scheduling_manager_location_id()
      or resource_id in (
        select id from public.scheduling_resources
        where location_id = public.scheduling_manager_location_id()
      )
    )
  );

-- ─────────────────────────────────────────────
-- 3. AVAILABILITY RULE TYPE
-- Adds support for date-specific windows alongside recurring weekly rules.
-- ─────────────────────────────────────────────
create type public.scheduling_availability_rule_type as enum (
  'recurring',     -- repeats every matching day_of_week (original behavior)
  'date_specific'  -- applies to an explicit date range (effective_from..effective_until)
);

alter table public.scheduling_availability_rules
  add column if not exists rule_type public.scheduling_availability_rule_type
    not null default 'recurring';

-- Make day_of_week nullable so date_specific rules don't require it.
alter table public.scheduling_availability_rules
  alter column day_of_week drop not null;

-- Enforce: recurring must have day_of_week; date_specific must have both effective dates.
alter table public.scheduling_availability_rules
  drop constraint if exists chk_rule_type_fields;

alter table public.scheduling_availability_rules
  add constraint chk_rule_type_fields check (
    (rule_type = 'recurring'     and day_of_week is not null) or
    (rule_type = 'date_specific' and effective_from is not null and effective_until is not null)
  );

comment on column public.scheduling_availability_rules.rule_type is
  'recurring: repeats on day_of_week every week (original behavior). '
  'date_specific: applies only within effective_from..effective_until date range, '
  'every day in that range that falls within start_time..end_time.';
