-- ============================================================
-- SCHEDULING CORE — Seed Data
-- Domain-neutral demonstration data.
-- Shows how Encounter Connect concepts map to the core.
-- ============================================================

-- ─────────────────────────────────────────────
-- LOCATIONS (maps to EC Campuses)
-- ─────────────────────────────────────────────
insert into public.scheduling_locations (id, name, description, address, timezone, is_virtual, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'Main Campus',       'Primary physical location',           '123 Main St, Springfield, IL', 'America/Chicago', false, true),
  ('10000000-0000-0000-0000-000000000002', 'North Campus',      'North side satellite location',       '456 North Ave, Springfield, IL', 'America/Chicago', false, true),
  ('10000000-0000-0000-0000-000000000003', 'Video / Online',    'Remote / virtual meetings',            null, 'America/Chicago', true, true);

-- ─────────────────────────────────────────────
-- RESOURCE GROUPS (maps to EC Connector Teams)
-- ─────────────────────────────────────────────
insert into public.scheduling_resource_groups (id, name, description, location_id, is_active) values
  ('20000000-0000-0000-0000-000000000001', 'Connection Team A', 'Main campus connector team',   '10000000-0000-0000-0000-000000000001', true),
  ('20000000-0000-0000-0000-000000000002', 'Connection Team B', 'North campus connector team',  '10000000-0000-0000-0000-000000000002', true);

-- ─────────────────────────────────────────────
-- RESOURCES (maps to EC Connectors + rooms)
-- ─────────────────────────────────────────────
insert into public.scheduling_resources (id, name, kind, description, email, timezone, location_id, group_id, default_capacity, is_active) values
  ('30000000-0000-0000-0000-000000000001', 'Sarah Mitchell',   'person', 'Connection coordinator',  'sarah@example.com',   'America/Chicago', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, true),
  ('30000000-0000-0000-0000-000000000002', 'James Carter',     'person', 'Connector / counselor',   'james@example.com',   'America/Chicago', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1, true),
  ('30000000-0000-0000-0000-000000000003', 'Maria Gonzalez',   'person', 'North campus connector',  'maria@example.com',   'America/Chicago', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1, true),
  ('30000000-0000-0000-0000-000000000004', 'Room 101',         'room',   'Small meeting room',      null,                  'America/Chicago', '10000000-0000-0000-0000-000000000001', null,                                   4, true),
  ('30000000-0000-0000-0000-000000000005', 'New Members Class', 'class_slot', 'Weekly membership intro class', null,        'America/Chicago', '10000000-0000-0000-0000-000000000001', null,                                  20, true);

-- ─────────────────────────────────────────────
-- APPOINTMENT TYPES
-- ─────────────────────────────────────────────
insert into public.scheduling_appointment_types
  (id, name, slug, description, duration_minutes, buffer_before_minutes, buffer_after_minutes,
   min_notice_hours, max_advance_days, cancellation_cutoff_hours,
   max_attendees, requires_confirmation, location_mode, is_active, is_public)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'One-on-One Meeting',
    'one-on-one',
    'A personal meeting with a connector or coordinator.',
    60, 0, 15, 24, 60, 24, 1, false, 'in_person', true, true
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'Follow-Up Call',
    'follow-up-call',
    'A brief phone or video check-in.',
    30, 0, 10, 12, 30, 12, 1, false, 'phone', true, false
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'Class / Group Session',
    'class-session',
    'Group class or information session with multiple participants.',
    90, 0, 0, 48, 90, 48, 20, true, 'in_person', true, true
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    'Video Consultation',
    'video-consult',
    'Remote consultation via video.',
    45, 0, 10, 24, 60, 24, 1, false, 'video', true, true
  );

-- ─────────────────────────────────────────────
-- APPOINTMENT TYPE ↔ RESOURCE MAP
-- ─────────────────────────────────────────────
insert into public.scheduling_appointment_type_resource_map (appointment_type_id, resource_id) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000005'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003');

-- ─────────────────────────────────────────────
-- AVAILABILITY RULES
-- Weekly recurring availability windows (0=Sun, 1=Mon … 6=Sat)
-- ─────────────────────────────────────────────

-- Sarah Mitchell: Mon–Fri 9am–5pm
insert into public.scheduling_availability_rules
  (resource_id, day_of_week, start_time, end_time, timezone, is_active)
select '30000000-0000-0000-0000-000000000001', d, '09:00:00', '17:00:00', 'America/Chicago', true
from generate_series(1,5) as d;

-- James Carter: Mon/Wed/Fri 10am–4pm, Tue/Thu 1pm–6pm
insert into public.scheduling_availability_rules
  (resource_id, day_of_week, start_time, end_time, timezone, is_active)
values
  ('30000000-0000-0000-0000-000000000002', 1, '10:00:00', '16:00:00', 'America/Chicago', true),
  ('30000000-0000-0000-0000-000000000002', 3, '10:00:00', '16:00:00', 'America/Chicago', true),
  ('30000000-0000-0000-0000-000000000002', 5, '10:00:00', '16:00:00', 'America/Chicago', true),
  ('30000000-0000-0000-0000-000000000002', 2, '13:00:00', '18:00:00', 'America/Chicago', true),
  ('30000000-0000-0000-0000-000000000002', 4, '13:00:00', '18:00:00', 'America/Chicago', true);

-- Maria Gonzalez: Tue–Sat 9am–3pm
insert into public.scheduling_availability_rules
  (resource_id, day_of_week, start_time, end_time, timezone, is_active)
select '30000000-0000-0000-0000-000000000003', d, '09:00:00', '15:00:00', 'America/Chicago', true
from generate_series(2,6) as d;

-- New Members Class: Sunday 11am–12:30pm
insert into public.scheduling_availability_rules
  (resource_id, day_of_week, start_time, end_time, timezone, is_active)
values
  ('30000000-0000-0000-0000-000000000005', 0, '11:00:00', '12:30:00', 'America/Chicago', true);

-- ─────────────────────────────────────────────
-- SAMPLE BOOKINGS
-- ─────────────────────────────────────────────
insert into public.scheduling_bookings
  (id, appointment_type_id, resource_id, location_id, title, starts_at, ends_at, timezone, status, notes)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'One-on-One Meeting',
    (now() + interval '2 days')::date + time '10:00:00',
    (now() + interval '2 days')::date + time '11:00:00',
    'America/Chicago',
    'confirmed',
    'First meeting with new participant'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    null,
    'Follow-Up Call',
    (now() + interval '3 days')::date + time '14:00:00',
    (now() + interval '3 days')::date + time '14:30:00',
    'America/Chicago',
    'pending_confirmation',
    null
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'New Members Class',
    (now() + interval '7 days')::date + time '11:00:00',
    (now() + interval '7 days')::date + time '12:30:00',
    'America/Chicago',
    'confirmed',
    null
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'One-on-One Meeting',
    (now() - interval '5 days')::date + time '10:00:00',
    (now() - interval '5 days')::date + time '11:00:00',
    'America/Chicago',
    'completed',
    'Went well, discussed next steps'
  );

-- ─────────────────────────────────────────────
-- SAMPLE ATTENDEES
-- ─────────────────────────────────────────────
insert into public.scheduling_booking_attendees
  (booking_id, role, display_name, email, attended)
values
  ('50000000-0000-0000-0000-000000000001', 'primary',   'Alex Thompson',  'alex@example.com',  null),
  ('50000000-0000-0000-0000-000000000002', 'primary',   'Jordan Williams','jordan@example.com',null),
  ('50000000-0000-0000-0000-000000000003', 'primary',   'Casey Davis',    'casey@example.com', null),
  ('50000000-0000-0000-0000-000000000003', 'secondary', 'Pat Rivera',     'pat@example.com',   null),
  ('50000000-0000-0000-0000-000000000004', 'primary',   'Sam Johnson',    'sam@example.com',   true);

-- ─────────────────────────────────────────────
-- SAMPLE OUTCOME (for the completed booking)
-- ─────────────────────────────────────────────
insert into public.scheduling_outcomes
  (booking_id, kind, summary, next_action)
values
  (
    '50000000-0000-0000-0000-000000000004',
    'follow_up_required',
    'Good initial conversation. Participant expressed interest in membership class.',
    'Schedule membership class signup'
  );

-- ─────────────────────────────────────────────
-- SAMPLE EXTERNAL REFS (demonstrating EC integration)
-- ─────────────────────────────────────────────
insert into public.scheduling_external_refs
  (booking_id, external_type, external_id, relation_kind)
values
  -- Booking 1: linked to an EC participant
  ('50000000-0000-0000-0000-000000000001', 'encounter_participant',       'ec-participant-uuid-001', 'primary_subject'),
  -- Booking 1: also gates a workflow step
  ('50000000-0000-0000-0000-000000000001', 'encounter_workflow_step',     'ec-step-uuid-001',       'workflow_gate'),
  -- Booking 2: linked to a connector assignment
  ('50000000-0000-0000-0000-000000000002', 'encounter_participant',       'ec-participant-uuid-002', 'primary_subject'),
  ('50000000-0000-0000-0000-000000000002', 'encounter_connector_assignment', 'ec-assign-uuid-001',  'linked_context');

-- ─────────────────────────────────────────────
-- SAMPLE REMINDERS
-- ─────────────────────────────────────────────
insert into public.scheduling_reminders
  (booking_id, channel, offset_minutes, scheduled_for, status, recipient)
values
  (
    '50000000-0000-0000-0000-000000000001',
    'email',
    1440,
    ((now() + interval '2 days')::date + time '10:00:00') - interval '1 day',
    'pending',
    'alex@example.com'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'sms',
    60,
    ((now() + interval '3 days')::date + time '14:00:00') - interval '1 hour',
    'pending',
    null
  );

-- ─────────────────────────────────────────────
-- SAMPLE BLACKOUT
-- ─────────────────────────────────────────────
insert into public.scheduling_blackouts
  (resource_id, scope, title, reason, starts_at, ends_at, is_active)
values
  (
    '30000000-0000-0000-0000-000000000001',
    'resource',
    'Staff Training Day',
    'Annual staff development day — no appointments',
    (now() + interval '10 days')::date + time '00:00:00',
    (now() + interval '11 days')::date + time '00:00:00',
    true
  );

-- ─────────────────────────────────────────────
-- TAGS
-- ─────────────────────────────────────────────
insert into public.scheduling_tags (id, name, color) values
  ('60000000-0000-0000-0000-000000000001', 'first-time',       '#3B82F6'),
  ('60000000-0000-0000-0000-000000000002', 'membership-track', '#10B981'),
  ('60000000-0000-0000-0000-000000000003', 'needs-followup',   '#F59E0B');

insert into public.scheduling_booking_tags (booking_id, tag_id) values
  ('50000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000003');
