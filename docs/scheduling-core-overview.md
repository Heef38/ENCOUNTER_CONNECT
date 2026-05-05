# Scheduling Core — Architecture Overview

## Purpose

The Scheduling Core is a standalone, domain-neutral scheduling module built for Next.js + Supabase.
It is designed to be reused across multiple applications. Its first integration target is **Encounter Connect**, a church connection platform.

The core is intentionally free of church-specific vocabulary. Terms like "connector," "participant," and "campus" appear only in the adapter layer — never in the core schema, types, or services.

---

## Architecture Layers

### Layer A — Core Scheduling Engine (`/lib/scheduling/`)

The reusable engine. Contains no references to any host application.

| Subfolder | Contents |
|---|---|
| `types/` | All TypeScript types for every entity |
| `services/` | Business logic (bookings, resources, appointment types, slots) |
| `slot-engine/` | Pure date/time logic for slot generation and conflict detection |
| `validators/` | Input validation functions |
| `queries/` | Supabase query builders (accept a client, return typed data) |

**Package-readiness note:** Every file in `/lib/scheduling/` avoids importing from `@/app/` or `@/lib/supabase/`. The only external dependency is `@supabase/supabase-js` (client is injected). This layer is safe to extract into a shared npm package.

### Layer B — Domain Adapter (`/lib/scheduling/adapters/`)

Translates host-app concepts into core primitives. Currently contains:

- **`encounter-connect.ts`** — typed helpers for mapping EC participants, connectors, workflow steps, and campuses into Scheduling Core calls.

When the core is extracted to a package, this file moves into the host app.

### Layer C — Application Layer (App-specific)

| Path | Role |
|---|---|
| `/app/scheduling/actions.ts` | Server Actions (bridge between UI and services) |
| `/app/api/scheduling/` | REST route handlers for client-side fetches |
| `/app/scheduling/` | UI pages |
| `/components/scheduling/` | UI components |
| `/lib/supabase/` | Supabase client factory (app-specific) |

---

## Data Model

### Core Tables

| Table | Purpose |
|---|---|
| `scheduling_locations` | Physical/virtual locations. Maps to EC campuses. |
| `scheduling_resource_groups` | Optional groupings of resources (e.g. connector teams). |
| `scheduling_resources` | Any schedulable asset: person, room, class slot, equipment. |
| `scheduling_appointment_types` | Reusable booking templates with duration, buffers, window rules. |
| `scheduling_appointment_type_resource_map` | Which resources can fulfill which appointment types. |
| `scheduling_availability_rules` | Recurring weekly windows per resource. |
| `scheduling_blackouts` | Point-in-time overrides (PTO, holidays, closures). |
| `scheduling_bookings` | The core booking record. |
| `scheduling_booking_attendees` | People attached to a booking (may or may not have auth accounts). |
| `scheduling_booking_status_history` | Immutable audit log of status transitions (auto-populated by trigger). |
| `scheduling_outcomes` | Post-booking resolution (completed, no-show, needs reassignment, etc.). |
| `scheduling_external_refs` | **Critical bridge table** — links bookings to external domain entities. |
| `scheduling_reminders` | Scheduled notification records. |
| `scheduling_notification_log` | Immutable delivery audit log. |
| `scheduling_tags` | Free-form labels. |
| `scheduling_booking_tags` | Many-to-many booking ↔ tag. |

### External References Design

The `scheduling_external_refs` table is the most important integration point. It allows a booking to reference entities in any external system without schema coupling:

```sql
-- Example: attach an Encounter Connect participant and workflow step to a booking
insert into scheduling_external_refs (booking_id, external_type, external_id, relation_kind)
values
  (<booking_id>, 'encounter_participant',   '<participant_uuid>', 'primary_subject'),
  (<booking_id>, 'encounter_workflow_step', '<step_uuid>',        'workflow_gate');
```

The `relation_kind` column supports:
- `primary_subject` — the person this booking is primarily for
- `workflow_gate` — a workflow step that is blocked until this booking is completed
- `linked_context` — supplemental context (e.g. connector assignment)
- `assigned_resource` — the resource entity in the external system
- `reporting_target` — for analytics/reporting pipelines

---

## Slot Engine

The slot engine (`/lib/scheduling/slot-engine/index.ts`) is a pure TypeScript module with no I/O dependencies. It accepts plain data objects and returns `TimeSlot[]`.

### `generateAvailableSlots(input)`

1. Iterates day-by-day over the requested date range.
2. For each day, finds applicable availability rules (by day_of_week and effective date range).
3. Within each availability window, generates slots at `duration_minutes` intervals.
4. For each slot, checks:
   - Booking window rules (min_notice_hours, max_advance_days)
   - Blackout overlaps (including buffer periods)
   - Conflict count vs. resource capacity
5. Returns all slots with `available: boolean` and `capacity_remaining: number`.

### Key service functions

| Function | Location |
|---|---|
| `getAvailableSlots()` | `services/slots.ts` |
| `createBooking()` | `services/bookings.ts` |
| `cancelBooking()` | `services/bookings.ts` |
| `rescheduleBooking()` | `services/bookings.ts` |
| `completeBooking()` | `services/bookings.ts` |
| `markNoShow()` | `services/bookings.ts` |
| `confirmBooking()` | `services/bookings.ts` |
| `listBookings()` | `services/bookings.ts` |
| `createResource()` | `services/resources.ts` |
| `createAvailabilityRule()` | `services/resources.ts` |
| `createBlackout()` | `services/resources.ts` |
| `createAppointmentType()` | `services/appointment-types.ts` |

---

## RLS Design

Roles (stored in `user_profiles.role`): `admin`, `manager`, `resource`, `participant`

| Role | Capabilities |
|---|---|
| `admin` | Full access to all tables |
| `manager` | Full scheduling management (no user admin) |
| `resource` | Self-view bookings, self-manage availability, view own bookings |
| `participant` | Create bookings, view own bookings and attendee records |

Helper functions:
- `scheduling_current_role()` — reads current user's role
- `scheduling_has_role(required)` — hierarchical role check

---

## Design Decisions

1. **Buffers are invisible to attendees** — buffer_before/after inflate the conflict detection window but the slot end shown to users is just `start + duration`.

2. **Rescheduling creates a new booking** — the original is marked `rescheduled` for full audit history. This avoids data mutation and preserves the timeline.

3. **Status history is trigger-driven** — `log_booking_status_change()` fires automatically on every status update, ensuring the audit trail is never accidentally skipped.

4. **Capacity is per-resource, not per-slot** — `default_capacity` on the resource allows rooms and class slots to support multiple concurrent bookings. The slot engine counts conflicts against capacity.

5. **Attendees are decoupled from auth users** — `user_id` is nullable on `scheduling_booking_attendees`, allowing external participants to be recorded before they have an account.

6. **`metadata jsonb` used sparingly** — only on entities where genuine flexibility is needed. Core fields are explicitly typed columns.
