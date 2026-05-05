# Scheduling Core — Completion Log

**Built:** March 2026
**Stack:** Next.js 16 App Router · TypeScript · Supabase · TailwindCSS v4 · date-fns · date-fns-tz

---

## What Was Fully Built

### Database Schema
- [x] All 14 core tables with proper column types, constraints, and indexes
- [x] 6 PostgreSQL enums (resource kind, location mode, blackout scope, booking status, attendee role, outcome kind, ref relation kind, reminder channel/status)
- [x] `updated_at` triggers on all mutable tables
- [x] Auto status history trigger on booking status changes
- [x] RLS enabled on all tables
- [x] Role helper functions (`scheduling_current_role()`, `scheduling_has_role()`)
- [x] Complete RLS policy set for all 4 roles
- [x] User profiles auth stub table

### TypeScript Types (`/lib/scheduling/types/index.ts`)
- [x] All entity types (15 types)
- [x] All input/create types
- [x] Filter types for list queries
- [x] Slot engine types (`TimeSlot`, `GetAvailableSlotsInput`)
- [x] Rich joined types for UI (`BookingWithRelations`, `ResourceWithAvailability`)
- [x] Generic `ServiceResult<T>` wrapper

### Service Layer
- [x] `services/bookings.ts` — `listBookings`, `getBooking`, `createBooking`, `cancelBooking`, `rescheduleBooking`, `confirmBooking`, `completeBooking`, `markNoShow`
- [x] `services/resources.ts` — `listResources`, `getResource`, `createResource`, `updateResource`, `deactivateResource`, `createAvailabilityRule`, `deleteAvailabilityRule`, `createBlackout`, `deleteBlackout`
- [x] `services/appointment-types.ts` — `listAppointmentTypes`, `getAppointmentType`, `createAppointmentType`, `updateAppointmentType`
- [x] `services/slots.ts` — `getAvailableSlots` (Supabase bridge to slot engine)

### Slot Engine (`/lib/scheduling/slot-engine/index.ts`)
- [x] `generateAvailableSlots()` — full slot generation with availability rules, blackouts, buffers, capacity
- [x] `isWithinAvailability()` — rule-based window check
- [x] `isBlackedOut()` — blackout overlap detection
- [x] `hasConflict()` / `countConflicts()` — capacity-aware conflict detection
- [x] `isWithinBookingWindow()` — min notice and max advance checks
- [x] `computeEndsAt()` — duration calculator
- [x] `formatSlotLabel()` / `formatSlotRange()` — display helpers
- [x] Timezone-aware using `date-fns-tz`

### Validators
- [x] `validateCreateBooking`, `validateCreateResource`, `validateCreateAppointmentType`, `validateAvailabilityRule`

### Query Helpers
- [x] `queries/bookings.ts` — `queryBookings` (filterable), `queryBookingById` (full joins)
- [x] `queries/resources.ts` — `queryResources`, `queryResourceById`, `queryAvailabilityRules`, `queryBlackouts`

### Server Actions (`/app/scheduling/actions.ts`)
- [x] All booking actions (create, cancel, confirm, complete, reschedule, no-show)
- [x] All resource actions (create, update, availability rule CRUD, blackout CRUD)
- [x] All appointment type actions (create, update)
- [x] Path revalidation on all mutating actions

### API Route Handlers
- [x] `GET /api/scheduling/slots` — slot availability query
- [x] `GET /api/scheduling/appointment-types` — list types
- [x] `GET /api/scheduling/appointment-types/[id]` — single type
- [x] `GET /api/scheduling/resources` — list resources
- [x] `GET /api/scheduling/resources/[id]` — single resource

### UI Pages
- [x] `/scheduling` — Dashboard with status counts and upcoming bookings table
- [x] `/scheduling/bookings` — Filterable bookings table (status, resource, type, date range)
- [x] `/scheduling/bookings/[id]` — Full booking detail (metadata, attendees, status history, outcome, external refs, reminders)
- [x] `/scheduling/bookings/[id]` — Booking actions (confirm, complete with outcome, cancel, no-show)
- [x] `/scheduling/resources` — Resource card grid
- [x] `/scheduling/resources/new` — Resource creation form
- [x] `/scheduling/resources/[id]` — Resource edit form
- [x] `/scheduling/appointment-types` — Types table
- [x] `/scheduling/appointment-types/new` — Creation form
- [x] `/scheduling/appointment-types/[id]` — Edit form
- [x] `/scheduling/availability` — Availability rules + blackouts editor (per resource)
- [x] `/scheduling/new-booking` — 5-step booking wizard (type → resource → slot → attendee → confirm)

### UI Components
- [x] `StatusBadge` — booking status with color coding
- [x] `StatsCard` — dashboard metric card
- [x] `BookingsTable` + `BookingRow` — list view
- [x] `BookingForm` — 5-step wizard with slot loading
- [x] `BookingActions` — inline action panel on detail page
- [x] `ResourceForm` — create/edit
- [x] `ResourceCard` — list card
- [x] `AppointmentTypeForm` — create/edit
- [x] `AvailabilityEditor` — rules + blackouts with inline add/delete

### Encounter Connect Adapter
- [x] EC domain type stubs
- [x] External ref builder functions (participant, workflow step, connector assignment)
- [x] Booking input builders (connector meeting, class signup)
- [x] Resource mapper (connector → resource)
- [x] Outcome → workflow progression evaluator stub
- [x] Full inline documentation of integration patterns

### Seed Data
- [x] 3 locations
- [x] 2 resource groups
- [x] 5 resources (3 people, 1 room, 1 class slot)
- [x] 4 appointment types
- [x] Appointment type ↔ resource mappings
- [x] Availability rules for all person resources + class
- [x] 4 sample bookings (confirmed, pending, upcoming class, completed)
- [x] Sample attendees, outcome, external refs, reminders, blackout, tags

### Documentation
- [x] `scheduling-core-overview.md` — architecture, data model, service map, design decisions
- [x] `encounter-connect-integration-notes.md` — EC domain mapping, all integration scenarios
- [x] `scheduling-core-completion-log.md` — this file

---

## What Was Partially Scaffolded (Works, But Needs Expansion)

### Notifications / Reminders
- Reminder records are created automatically on booking creation (24h email reminder)
- Reminder status is tracked in the DB
- **Not implemented:** actual delivery. A `NotificationAdapter` interface should be created, and implementations for email (SendGrid/Postmark), SMS (Twilio), and push should be wired to a background job that processes `scheduling_reminders WHERE status = 'pending' AND scheduled_for <= now()`.

### RLS — Nuances
- Policies are logically correct for the stated roles
- **Assumption:** The broader app populates `user_profiles` at sign-up. No trigger is provided for this. An `on auth.users insert` trigger should create the profile row.
- **Missing:** Campus-scoped manager policies. Currently, all `manager` role users see all records. A real implementation would scope managers to their `location_id`.

### Rescheduling UI
- Service-layer reschedule logic is fully implemented
- **Not implemented:** A reschedule UI on the booking detail page. The `BookingActions` component can be extended to add a "Reschedule" flow similar to the new booking wizard.

### Booking Wizard — Auto Resource Selection
- Currently requires manual resource selection
- **Scaffolded:** The slot API can accept no `resource_id` and will check all resources mapped to the appointment type. The UI wizard can be extended to auto-select or show a combined slot list.

---

## What Still Needs Implementation

| Item | Priority | Notes |
|---|---|---|
| Notification delivery adapter | High | See NotificationAdapter interface design below |
| `user_profiles` auto-create trigger | High | Required for RLS to work correctly |
| Campus-scoped manager RLS | Medium | Currently all managers see all records |
| Reschedule UI | Medium | Service layer is done; only UI missing |
| Pagination in bookings list | Medium | Query uses `LIMIT 100`; add proper cursor/offset pagination |
| Booking confirmation emails | Medium | Tie to notification adapter |
| Calendar/agenda view | Low | The slot engine data is ready; needs a calendar UI component |
| Export / reporting | Low | Queries exist; needs a CSV export endpoint |
| Webhook integration for outcomes | Low | For real-time EC workflow progression |
| Encounter Connect live integration | Depends on EC | Adapter is scaffolded; needs EC types imported |

---

## Notification Adapter Design (Recommended Next Step)

```typescript
// /lib/scheduling/adapters/notification-adapter.ts
export interface NotificationAdapter {
  sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean }>;
  sendSms(to: string, body: string): Promise<{ success: boolean }>;
}

// Placeholder adapter for development
export class ConsoleNotificationAdapter implements NotificationAdapter {
  async sendEmail(to, subject, body) {
    console.log('[EMAIL]', { to, subject, body });
    return { success: true };
  }
  async sendSms(to, body) {
    console.log('[SMS]', { to, body });
    return { success: true };
  }
}
```

A background job (Supabase Edge Function or a cron route) would:
1. Query `scheduling_reminders WHERE status = 'pending' AND scheduled_for <= now()`
2. Load the booking and attendee details
3. Call the adapter's send method
4. Update the reminder status to `sent` or `failed`
5. Insert a row into `scheduling_notification_log`

---

## Assumptions Made

1. **Timezone default:** `America/Chicago` is the default timezone throughout. Easily changed via env var if needed.
2. **Auth:** Supabase Auth is used. The `user_profiles` table is a stub; the host app should own this table with appropriate triggers.
3. **Role assignment:** Roles are manually assigned in `user_profiles`. The host app should handle role assignment during onboarding.
4. **No calendar drag-and-drop:** Slot selection is list-based. A calendar component (e.g. FullCalendar) can be integrated on top of the existing slot API.
5. **No real-time:** Pages use Next.js server components with revalidation. Real-time updates (via Supabase Realtime) would be a meaningful improvement for the booking detail page.
6. **Single timezone per resource:** Resources have one timezone. Cross-timezone scheduling requires presenting slots in the attendee's local timezone; the slot engine's `generateAvailableSlots` produces UTC times and the UI can format them in any timezone.

---

## Technical Debt Notes

- The `BookingForm` wizard calls the slot API via `fetch` from the client. In a production build, consider using a React Query or SWR cache layer.
- The availability page uses a GET-based form for resource selection (triggers a page reload). A client-side state approach would be smoother.
- Error handling in server actions returns string errors; a more structured error code system would improve downstream handling.
- The `as never` casts in some page files are pragmatic shortcuts around complex joined types. Define proper Supabase-generated types when a `supabase gen types` step is added to the build process.

---

## Recommended Next Build Steps

1. Add Supabase type generation (`npx supabase gen types typescript`) and replace manual `as never` casts.
2. Add a `user_profiles` auto-create trigger in Supabase.
3. Implement the `NotificationAdapter` with a placeholder console adapter and wire it to a reminder processing job.
4. Add the Encounter Connect live integration by importing EC types and wiring the adapter functions.
5. Add a reschedule UI on the booking detail page.
6. Add pagination to the bookings list.
7. Replace the resource selector on the availability page with client-side state for a smoother UX.
