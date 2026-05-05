# Encounter Connect — Scheduling Core Integration Notes

## Overview

The Scheduling Core was designed with Encounter Connect as its first integration target. This document explains how EC domain concepts map to the scheduling core and how the two systems interact.

---

## Domain Mapping

| Encounter Connect | Scheduling Core |
|---|---|
| Campus | `scheduling_locations` |
| Connector | `scheduling_resources` (kind=`person`, linked via `user_id`) |
| Connector Team | `scheduling_resource_groups` |
| Participant | `scheduling_booking_attendees` (user or external) |
| Connector Assignment | External ref (`encounter_connector_assignment`) |
| Workflow Step | External ref (`encounter_workflow_step`) + booking gate check |
| Class / Group Event | `scheduling_resources` (kind=`class_slot`, capacity > 1) |
| Care Meeting | Appointment type (`in_person` or `phone` mode) |
| Follow-Up Call | Appointment type (kind=`phone`, short duration) |

---

## Integration Scenarios

### 1. Participant Books a Meeting With a Connector

1. EC resolves the participant's assigned connector → gets their `scheduling_resource_id`.
2. EC calls `getAvailableSlots({ appointment_type_id, resource_id, date_from, date_to })`.
3. Participant selects a slot.
4. EC calls `createBooking()` using the adapter helper `buildConnectorMeetingBooking()`, which attaches:
   - `encounter_participant` external ref (relation: `primary_subject`)
   - `encounter_workflow_step` external ref (relation: `workflow_gate`) if this booking gates a workflow step
   - `encounter_connector_assignment` external ref (relation: `linked_context`)

### 2. Participant Signs Up For a Class

1. Class sessions are modeled as a `scheduling_resource` with `kind='class_slot'` and `default_capacity` = class max size.
2. The matching appointment type has `max_attendees` set to class capacity.
3. Each registration is a booking against the class resource.
4. Multiple bookings coexist up to capacity; the slot engine enforces the cap.
5. Use `buildClassSignupBooking()` from the adapter.

### 3. Workflow Step Requires a Booking Before Progression

This is the most important EC integration pattern.

```
EC Workflow Step: requires_booking = true, appointment_type_slug = 'one-on-one'

When EC checks if a step is satisfied:

SELECT sb.id
FROM scheduling_bookings sb
JOIN scheduling_external_refs ser ON ser.booking_id = sb.id
WHERE ser.external_type = 'encounter_workflow_step'
  AND ser.external_id = '<step_id>'
  AND sb.status = 'completed'
LIMIT 1;

If a row exists → step is satisfied → workflow can advance.
If no row → step is blocked → participant must book first.
```

### 4. Connector Self-Manages Availability

1. When a connector is onboarded in EC:
   - Call `createResource()` using `mapConnectorToResource()` from the adapter.
   - Store the returned `scheduling_resource_id` on the EC connector record.
   - Link the resource's `user_id` to the connector's Supabase auth UID.
2. The connector logs into the app and navigates to `/scheduling/availability`.
3. RLS policies allow them to manage only their own availability rules and blackouts.
4. When they take PTO, they add a blackout; the slot engine automatically hides those times.

### 5. Outcome Feeds Back Into Workflow Progression

After a connector completes a booking:
1. The connector uses the booking detail page to record an outcome (kind, summary, next action).
2. EC polls or subscribes to `scheduling_outcomes` for bookings with `encounter_workflow_step` refs.
3. EC calls `evaluateOutcomeForWorkflowProgression(outcome.kind)` from the adapter.
4. If `canAdvance: true`, EC marks the workflow step complete.
5. If `canAdvance: false` (e.g. no-show, needs reassignment), EC flags the step for admin review.

### 6. Campus-Scoped Scheduling

1. Each campus is a `scheduling_location`.
2. Resources have `location_id` pointing to their campus.
3. Campus admins filter resources by `location_id` when managing their team.
4. The slot engine fetches resources filtered by location, giving campus-scoped availability.
5. Cross-campus bookings are possible (just remove the location filter).

---

## Adapter File

**`/lib/scheduling/adapters/encounter-connect.ts`**

This file contains:
- Typed EC domain stubs (`ECParticipant`, `ECConnector`, `ECWorkflowStep`, etc.)
- External ref builder functions
- Booking input builder functions
- Resource mapper functions
- Outcome → workflow progression evaluator
- Inline documentation of integration patterns

When the Scheduling Core is extracted into a shared package, this adapter file moves into the Encounter Connect codebase and imports from the package.

---

## Recommended Integration Sequence

1. **Schema alignment**: Ensure EC's `profiles` table can supply the `user_profiles` role values (or map roles at query time).
2. **Connector provisioning**: On connector creation in EC, auto-create the scheduling resource.
3. **Workflow step integration**: Add `scheduling_gate` fields to EC workflow step records; query scheduling_external_refs when evaluating step completion.
4. **Participant booking UI**: Embed the booking form (or a simplified version) in the EC participant portal, pre-seeding the attendee info from the EC participant profile.
5. **Notifications**: Wire reminder delivery to EC's existing notification system (Twilio/SendGrid) using the `scheduling_reminders` table as the trigger source.

---

## What Stays Generic

The following will never change in the core, regardless of EC requirements:
- Table names and column structure
- Status lifecycle and history trigger
- Slot generation algorithm
- External refs design (just add new `external_type` strings)
- RLS role structure

These may be extended but not broken by EC integration:
- Adding new appointment types (via data, not code changes)
- Adding new outcome kinds (extend the enum in a future migration)
- Adding new reminder channels
