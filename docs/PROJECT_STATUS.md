# Encounter Connect — Project Status

**Last updated:** 2026-05-27

> The phase-by-phase history below (Phases 1–5) dates from the initial
> SchedulingCore → EC build. Everything since — auth, multi-tenancy,
> content model, notifications, public signup, the connector platform,
> and more — is summarized under **"Since the initial build"** before the
> phase log. See the project memory for the full per-feature change record.

---

## Overview

Encounter Connect is a church connection platform built on top of SchedulingCore.
The scheduling engine remains the operational backbone — untouched and fully intact.

---

## Architecture

```
SchedulingCore (existing, preserved)
  └── Scheduling Engine     /lib/scheduling/
  └── Event Engine          scheduling_bookings, scheduling_appointment_types
  └── Assignment Engine     scheduling_resources, availability_rules

Encounter Connect (new, layered on top)
  └── Church Structure      /lib/church/         campuses, profiles
  └── Participant Engine    /lib/participants/    participants, progress
  └── Connector Engine      /lib/connectors/     connectors
  └── Flow Engine           /lib/flows/          flows, flow_steps, participant_progress
  └── Dashboard System      /app/(ec)/dashboard/
```

---

## Completed

### Phase 1 — Repository Structure ✅
- [x] Route group `(ec)` added: `/app/(ec)/` with shared EC nav layout
- [x] App title updated to "Encounter Connect"
- [x] Root redirect updated: `/` → `/dashboard`
- [x] New lib domains created: `church`, `participants`, `connectors`, `flows`
- [x] New component domains: `components/flows/`
- [x] Scheduling preserved at `/app/scheduling/` — zero changes

### Phase 2 — Participant Domain ✅
- [x] `participants` table (migration 004)
- [x] `profiles` table (migration 004)
- [x] `campuses` table (migration 004)
- [x] TypeScript types: `ParticipantStatus`, `ProgressStatus`, all entity types
- [x] Services: `createParticipant`, `updateParticipant`, `assignConnector`, `updateProgress`
- [x] Queries: join-rich participant queries with campus + connector + progress
- [x] UI: participant list (`/participants`), detail (`/participants/[id]`), new form (`/participants/new`)
- [x] API: `GET/POST /api/participants`, `GET/PATCH /api/participants/[id]`

### Phase 3 — Flow Engine ✅
- [x] `flows` table (migration 004)
- [x] `flow_steps` table with `ec_flow_step_type` enum: manual, schedule, event, conversation, assessment
- [x] TypeScript types for all flow entities
- [x] Services: `createFlow`, `getFlow`, `listFlows`, `createFlowStep`, `updateFlowStep`, `deleteFlowStep`, `reorderFlowSteps`
- [x] Flow Engine: `initializeParticipantProgress`, `advanceParticipantStep`, `getCurrentStep`, `syncScheduleStepFromBooking`
- [x] UI: flow list (`/flows`), new flow (`/flows/new`), flow builder (`/flows/[id]`)
- [x] Flow builder: add, edit, delete, reorder steps; step type selector; appointment type linker
- [x] API: `GET/POST /api/flows`, `GET/PATCH /api/flows/[id]` (multi-action dispatch)
- [x] Components: `FlowStepList`, `StepTypeBadge`

### Phase 4 — Scheduling Integration ✅
- [x] `participant_progress.scheduled_event_id` links to `scheduling_bookings`
- [x] `flow_steps.appointment_type_id` links to `scheduling_appointment_types`
- [x] `connectors.scheduling_resource_id` links connector → scheduling resource
- [x] `campuses.scheduling_location_id` links campus → scheduling location
- [x] `syncScheduleStepFromBooking()` in flow engine: auto-advances step when booking completes
- [x] Connector detail page surfaces upcoming scheduling bookings
- [x] Scheduling nav link preserved in EC layout

### Phase 5 — Dashboards ✅
- [x] Admin dashboard (`/dashboard`): participant counts by status, active connector count, flow count, recent participants table
- [x] Connector dashboard (`/connectors/[id]`): assigned participants list + upcoming meetings from scheduler
- [x] Campus-scoped data: participants and connectors filterable by campus
- [x] Flow list shows step counts and active status

### Database ✅
- [x] Migration `004_encounter_connect.sql`: 7 new tables, 4 new enums
- [x] RLS enabled on all new tables
- [x] RLS helper functions: `ec_current_role()`, `ec_has_role()`, `ec_current_campus_id()`
- [x] `updated_at` triggers on all new tables
- [x] Foreign key integrity: new tables reference scheduling tables safely

### RLS Role System ✅
| Role          | Capabilities                                                        |
|---------------|---------------------------------------------------------------------|
| `church_admin`| Full access to all EC tables                                        |
| `campus_admin` | Manage participants, connectors, flows scoped to their campus      |
| `connector`   | Read/write participants and progress; read connectors               |
| `participant` | Read own profile and progress                                       |

---

## Since the initial build ✅

Delivered after the Phase 1–5 log below (migrations 005–016):

- **Phase 8 — Auth & multi-tenancy** — Supabase Auth + SSR, `proxy.ts` session
  refresh and route gating, role-aware landing. Full multi-tenancy: `churches`
  root, `church_id` on every EC table, `is_platform_admin`, RLS helpers.
- **Phase 9 — Content data model** — lessons, assessments (definitions /
  questions / responses / results + scoring & categories), serve teams,
  connect docs, audit log.
- **Participant journey** — `/journey` with phases, concurrent steps, and
  per-step renderers (video / assessment / schedule / event / manual).
- **Notifications** — outbox + templates, Resend (email) and Twilio (SMS)
  adapters, stale-reminder + step-completion + booking notices, cron drain.
- **Public signup** — `/signup` church picker → `/c/[church]/[campus]`,
  self-service participant registration.
- **Connector platform** — `/connector` home, per-participant journey view,
  auto-match best-fit connector with load balancing, booking confirm/decline.
- **Platform admin** — tenant onboarding (`/platform/churches`), church
  branding, campus landing pages, test-data harness.
- **Signup → flow auto-enrollment** (2026-05-27) — new signups are now
  enrolled in their campus default flow (falling back to the church-wide
  default), with progress rows initialized and `current_step_id` set. Closes
  the long-standing gap where signups had empty journeys.

---

## Open items

### Near term
- [ ] **Notifications on the manual booking path** — `/scheduling/new-booking`
      (manual) doesn't enqueue notifications; only auto-match and connector
      confirm/decline do.
- [ ] **Connect default flows to live churches** — auto-enrollment only fires
      when a church/campus has an active `is_default` flow with steps. Audit
      existing tenants and set defaults where missing.
- [ ] Mobile-first responsive audit of all EC pages.

### Reporting (not started)
- [ ] Campus dashboard: flow completion rates, connector activity
- [ ] Export participant progress as CSV
- [ ] Connector load-balancing / capacity view

### Launch checklist
- [ ] Magic-link auth alongside passwords (lower friction for members)
- [ ] Supabase Storage buckets + RLS for connect_docs / lesson media / logos
- [ ] Cron wired to `api/scheduling/process-reminders` + notification drain
- [ ] Sentry (or equivalent) error monitoring
- [ ] Dev / staging / prod Supabase project separation
- [ ] Test harness Option B (separate Supabase staging project)

---

## Architecture Decisions

### Why route group `(ec)` instead of a top-level layout change?
Scheduling has its own layout (`/app/scheduling/layout.tsx`) with its own nav.
Using `(ec)` keeps EC routes under a unified nav without touching the scheduling shell.
URL paths are clean: `/dashboard`, `/participants`, `/connectors`, `/flows`.

### Why separate `campuses` table instead of reusing `scheduling_locations`?
`scheduling_locations` is owned by the scheduling engine and has scheduling-specific fields
(timezone, is_virtual, address). `campuses` is an EC concept with a cleaner shape.
The `scheduling_location_id` FK bridges them when needed without coupling schemas.

### Why separate `profiles` table instead of extending `user_profiles`?
`user_profiles` is used by scheduling RLS. Extending it would risk breaking role checks
and mixing scheduling/EC concerns. `profiles` is EC-owned with EC roles.

### Why `ServiceResult<T>` from scheduling types?
Consistency. All service functions across both domains return `{ success: true; data: T }
| { success: false; error: string }`. No exception-based flow in server code.

### Why an action dispatch pattern in `/api/flows/[id]`?
Flow mutations (add_step, update_step, delete_step, reorder_steps) all operate on a flow
by ID. Rather than 4 separate sub-routes, a single PATCH with `action` keeps the API
surface minimal and the client code simple.

### How scheduling integration works
1. Connector is linked to a `scheduling_resource` via `connectors.scheduling_resource_id`
2. A `schedule` type flow step links to an `appointment_type` via `flow_steps.appointment_type_id`
3. When a booking is created for that step, `participant_progress.scheduled_event_id` stores the booking ID
4. When the booking is completed, `syncScheduleStepFromBooking()` auto-advances the step
5. The existing `scheduling_external_refs` table can link bookings back to participants for full traceability

---

## File Map

```
/app
  (ec)/
    layout.tsx              ← EC nav (Dashboard, Participants, Connectors, Flows, Scheduling)
    dashboard/page.tsx      ← Admin dashboard
    participants/
      page.tsx              ← Participant list with status filter
      new/page.tsx          ← Add participant form
      [id]/page.tsx         ← Participant detail + flow progress
    connectors/
      page.tsx              ← Connector grid with participant counts
      [id]/page.tsx         ← Connector detail + assigned participants + upcoming meetings
    flows/
      page.tsx              ← Flow list
      new/page.tsx          ← Create flow form
      [id]/page.tsx         ← Flow builder
  scheduling/               ← Untouched SchedulingCore UI
  api/
    participants/route.ts
    participants/[id]/route.ts
    connectors/route.ts
    flows/route.ts
    flows/[id]/route.ts
    scheduling/             ← Untouched SchedulingCore API

/lib
  church/
    types.ts               ← Campus, Profile types + ECUserRole
    services.ts            ← Campus CRUD, Profile upsert/update
  participants/
    types.ts               ← Participant, ParticipantProgress types
    queries.ts             ← Join-rich Supabase queries
    services.ts            ← CRUD + assignConnector + updateProgress
  connectors/
    types.ts               ← Connector types
    queries.ts             ← Connector queries with profile join
    services.ts            ← CRUD + listWithStats
  flows/
    types.ts               ← Flow, FlowStep types + FlowStepType enum
    queries.ts             ← Flow queries with steps + appointment type join
    services.ts            ← Flow CRUD + step CRUD + reorder
    engine.ts              ← Progress init, step advance, schedule sync
  scheduling/               ← Untouched SchedulingCore lib

/components
  flows/
    flow-step-list.tsx     ← Interactive flow builder (add/edit/delete/reorder)
    step-type-badge.tsx    ← Step type color badge
  scheduling/               ← Untouched SchedulingCore components

/supabase/migrations
  001_scheduling_core.sql  ← Untouched
  002_scheduling_rls.sql   ← Untouched
  003_scheduling_enhancements.sql ← Untouched
  004_encounter_connect.sql ← NEW: 7 tables, 4 enums, RLS

/docs
  PROJECT_STATUS.md        ← This file
  scheduling-core-overview.md
  encounter-connect-integration-notes.md
  scheduling-core-completion-log.md
```
