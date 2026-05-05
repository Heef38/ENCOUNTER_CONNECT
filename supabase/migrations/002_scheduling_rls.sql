-- ============================================================
-- SCHEDULING CORE — Migration 002: RLS Policies
-- Role hierarchy: admin > manager > resource > participant
-- ============================================================

-- ─────────────────────────────────────────────
-- HELPERS
-- ─────────────────────────────────────────────

-- Returns the current user's role from user_profiles.
-- Falls back to 'participant' if no profile row exists.
create or replace function public.scheduling_current_role()
returns text language sql stable security definer as $$
  select coalesce(
    (select role from public.user_profiles where id = auth.uid()),
    'participant'
  );
$$;

-- Returns true if the current user has at least the given role level.
create or replace function public.scheduling_has_role(required text)
returns boolean language sql stable security definer as $$
  select case required
    when 'admin'       then public.scheduling_current_role() = 'admin'
    when 'manager'     then public.scheduling_current_role() in ('admin','manager')
    when 'resource'    then public.scheduling_current_role() in ('admin','manager','resource')
    when 'participant' then public.scheduling_current_role() in ('admin','manager','resource','participant')
    else false
  end;
$$;

-- ─────────────────────────────────────────────
-- Enable RLS on all scheduling tables
-- ─────────────────────────────────────────────
alter table public.user_profiles                            enable row level security;
alter table public.scheduling_locations                     enable row level security;
alter table public.scheduling_resource_groups               enable row level security;
alter table public.scheduling_resources                     enable row level security;
alter table public.scheduling_appointment_types             enable row level security;
alter table public.scheduling_appointment_type_resource_map enable row level security;
alter table public.scheduling_availability_rules            enable row level security;
alter table public.scheduling_blackouts                     enable row level security;
alter table public.scheduling_bookings                      enable row level security;
alter table public.scheduling_booking_attendees             enable row level security;
alter table public.scheduling_booking_status_history        enable row level security;
alter table public.scheduling_outcomes                      enable row level security;
alter table public.scheduling_external_refs                 enable row level security;
alter table public.scheduling_reminders                     enable row level security;
alter table public.scheduling_notification_log              enable row level security;
alter table public.scheduling_tags                          enable row level security;
alter table public.scheduling_booking_tags                  enable row level security;

-- ─────────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────────
create policy "users can read own profile"
  on public.user_profiles for select
  using (id = auth.uid());

create policy "users can update own profile"
  on public.user_profiles for update
  using (id = auth.uid());

create policy "admins can manage all profiles"
  on public.user_profiles for all
  using (public.scheduling_has_role('admin'))
  with check (public.scheduling_has_role('admin'));

-- ─────────────────────────────────────────────
-- scheduling_locations
-- ─────────────────────────────────────────────
create policy "anyone authenticated can view active locations"
  on public.scheduling_locations for select
  using (auth.uid() is not null and is_active = true);

create policy "managers+ can view all locations"
  on public.scheduling_locations for select
  using (public.scheduling_has_role('manager'));

create policy "managers+ can manage locations"
  on public.scheduling_locations for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_resource_groups
-- ─────────────────────────────────────────────
create policy "managers+ can manage resource groups"
  on public.scheduling_resource_groups for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

create policy "resources can view their group"
  on public.scheduling_resource_groups for select
  using (
    public.scheduling_has_role('resource')
    and id in (
      select group_id from public.scheduling_resources
      where user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- scheduling_resources
-- ─────────────────────────────────────────────
create policy "anyone authenticated can view active resources"
  on public.scheduling_resources for select
  using (auth.uid() is not null and is_active = true);

create policy "resource can view their own record"
  on public.scheduling_resources for select
  using (user_id = auth.uid());

create policy "managers+ can manage resources"
  on public.scheduling_resources for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_appointment_types
-- ─────────────────────────────────────────────
create policy "anyone can view active public appointment types"
  on public.scheduling_appointment_types for select
  using (auth.uid() is not null and is_active = true and is_public = true);

create policy "managers+ can view all appointment types"
  on public.scheduling_appointment_types for select
  using (public.scheduling_has_role('manager'));

create policy "managers+ can manage appointment types"
  on public.scheduling_appointment_types for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_appointment_type_resource_map
-- ─────────────────────────────────────────────
create policy "anyone authenticated can view appt type resource map"
  on public.scheduling_appointment_type_resource_map for select
  using (auth.uid() is not null);

create policy "managers+ can manage appt type resource map"
  on public.scheduling_appointment_type_resource_map for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_availability_rules
-- ─────────────────────────────────────────────
create policy "resource can view own availability rules"
  on public.scheduling_availability_rules for select
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can view all availability rules"
  on public.scheduling_availability_rules for select
  using (public.scheduling_has_role('manager'));

create policy "resource can manage own availability rules"
  on public.scheduling_availability_rules for all
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  )
  with check (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can manage all availability rules"
  on public.scheduling_availability_rules for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_blackouts
-- ─────────────────────────────────────────────
create policy "resource can view own blackouts"
  on public.scheduling_blackouts for select
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can view all blackouts"
  on public.scheduling_blackouts for select
  using (public.scheduling_has_role('manager'));

create policy "resource can manage own blackouts"
  on public.scheduling_blackouts for all
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  )
  with check (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can manage all blackouts"
  on public.scheduling_blackouts for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_bookings
-- ─────────────────────────────────────────────
create policy "participant can view own bookings"
  on public.scheduling_bookings for select
  using (
    booked_by = auth.uid()
    or id in (
      select booking_id from public.scheduling_booking_attendees
      where user_id = auth.uid()
    )
  );

create policy "resource can view bookings assigned to them"
  on public.scheduling_bookings for select
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can view all bookings"
  on public.scheduling_bookings for select
  using (public.scheduling_has_role('manager'));

create policy "authenticated users can create bookings"
  on public.scheduling_bookings for insert
  with check (auth.uid() is not null);

create policy "participant can update own bookings"
  on public.scheduling_bookings for update
  using (booked_by = auth.uid())
  with check (booked_by = auth.uid());

create policy "resource can update bookings assigned to them"
  on public.scheduling_bookings for update
  using (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  )
  with check (
    resource_id in (
      select id from public.scheduling_resources where user_id = auth.uid()
    )
  );

create policy "managers+ can manage all bookings"
  on public.scheduling_bookings for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_booking_attendees
-- ─────────────────────────────────────────────
create policy "participant can view own attendee records"
  on public.scheduling_booking_attendees for select
  using (user_id = auth.uid());

create policy "booking owner can view attendees"
  on public.scheduling_booking_attendees for select
  using (
    booking_id in (
      select id from public.scheduling_bookings where booked_by = auth.uid()
    )
  );

create policy "resource can view attendees on their bookings"
  on public.scheduling_booking_attendees for select
  using (
    booking_id in (
      select id from public.scheduling_bookings
      where resource_id in (
        select id from public.scheduling_resources where user_id = auth.uid()
      )
    )
  );

create policy "managers+ can manage all attendees"
  on public.scheduling_booking_attendees for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

create policy "authenticated users can insert attendees for own bookings"
  on public.scheduling_booking_attendees for insert
  with check (
    booking_id in (
      select id from public.scheduling_bookings where booked_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- scheduling_booking_status_history
-- ─────────────────────────────────────────────
create policy "booking stakeholders can view status history"
  on public.scheduling_booking_status_history for select
  using (
    booking_id in (
      select id from public.scheduling_bookings
      where booked_by = auth.uid()
         or resource_id in (
           select id from public.scheduling_resources where user_id = auth.uid()
         )
    )
    or public.scheduling_has_role('manager')
  );

create policy "status history inserts via trigger only"
  on public.scheduling_booking_status_history for insert
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_outcomes
-- ─────────────────────────────────────────────
create policy "resource can insert outcomes for own bookings"
  on public.scheduling_outcomes for insert
  with check (
    booking_id in (
      select id from public.scheduling_bookings
      where resource_id in (
        select id from public.scheduling_resources where user_id = auth.uid()
      )
    )
  );

create policy "resource can view outcomes for own bookings"
  on public.scheduling_outcomes for select
  using (
    booking_id in (
      select id from public.scheduling_bookings
      where resource_id in (
        select id from public.scheduling_resources where user_id = auth.uid()
      )
    )
  );

create policy "participant can view outcomes for own bookings"
  on public.scheduling_outcomes for select
  using (
    booking_id in (
      select id from public.scheduling_bookings where booked_by = auth.uid()
    )
  );

create policy "managers+ can manage all outcomes"
  on public.scheduling_outcomes for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_external_refs
-- ─────────────────────────────────────────────
create policy "booking owner can view external refs"
  on public.scheduling_external_refs for select
  using (
    booking_id in (
      select id from public.scheduling_bookings where booked_by = auth.uid()
    )
  );

create policy "managers+ can manage external refs"
  on public.scheduling_external_refs for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_reminders
-- ─────────────────────────────────────────────
create policy "participant can view own reminders"
  on public.scheduling_reminders for select
  using (
    booking_id in (
      select id from public.scheduling_bookings where booked_by = auth.uid()
    )
  );

create policy "managers+ can manage reminders"
  on public.scheduling_reminders for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_notification_log
-- ─────────────────────────────────────────────
create policy "admins can view notification log"
  on public.scheduling_notification_log for select
  using (public.scheduling_has_role('admin'));

create policy "service role can insert notification log"
  on public.scheduling_notification_log for insert
  with check (public.scheduling_has_role('manager'));

-- ─────────────────────────────────────────────
-- scheduling_tags / booking_tags
-- ─────────────────────────────────────────────
create policy "anyone authenticated can view tags"
  on public.scheduling_tags for select
  using (auth.uid() is not null);

create policy "managers+ can manage tags"
  on public.scheduling_tags for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));

create policy "booking stakeholders can view booking tags"
  on public.scheduling_booking_tags for select
  using (
    booking_id in (
      select id from public.scheduling_bookings
      where booked_by = auth.uid()
    )
    or public.scheduling_has_role('manager')
  );

create policy "managers+ can manage booking tags"
  on public.scheduling_booking_tags for all
  using (public.scheduling_has_role('manager'))
  with check (public.scheduling_has_role('manager'));
