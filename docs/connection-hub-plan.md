# Connection Hub — design & implementation plan

**Status:** phase 1 largely built, 2026-08-17. See §11 for exactly what's in and what's not.

Turns the site's main page into a connection hub: every upcoming gathering across the
church, in calendar / list / map views, with member-created events, group-scoped
visibility, and filtered notification fan-out.

Decisions locked with the user on 2026-08-17:

| Question | Decision |
|---|---|
| Hub placement | `/` becomes the hub. Anonymous visitors get a real, usable browser of public events; authenticated users get the full filtered hub at the same URL. |
| Visibility | **Binary: public or private.** Public = fully visible to anyone, no login. Private = visible only to authenticated members of the targeted audience (plus host/cohost and connectors/admins). No intermediate tiers. |
| Audience model | Explicit **groups + membership** only. No gender/demographic columns on profiles. A self-declared attribute layer may come later inside the profile vault (chat-vision phase C). |
| Map view | **Deferred** to phase 4. Schema stores `lat`/`lng` + address-privacy flags from day one so the map is a drop-in. |
| Trust model | **Trust-then-verify.** Anyone who has been through the connect platform publishes immediately; a report hides the event and texts an admin. |

---

## 1. Why a new `events` domain (not `scheduling_bookings`)

`scheduling_bookings` models a **1:1 appointment against a resource's generated
availability** — appointment type, slot engine, confirm/decline, reminders. Events are
the opposite shape: host-declared time (no slot engine), many attendees, RSVP instead of
confirmation, audience scoping instead of a resource. Forcing events through bookings
would drag `appointment_types` and the slot engine into a domain that needs neither, and
`/lib/scheduling/` is off-limits per `AGENTS.md`.

So: a new `lib/events/` domain, church-scoped, following the existing `ServiceResult<T>`
pattern. Two deliberate seams back to scheduling:

- `events.scheduling_location_id` — optional, for a church-room event, so the room shows
  as occupied in the existing location views.
- `events.scheduling_booking_id` — optional, reserved for "this event also holds a room
  booking". Left null in phases 1–3; the column exists so we never migrate for it.

## 2. Migration 026 — groups

Next migration number is **026** (025 is the last applied).

```
ec_group_kind          ENUM: ministry | home_group | age_stage | interest | serve | custom
ec_group_member_role   ENUM: member | leader

groups (
  id, church_id NOT NULL, campus_id NULL,
  name, slug, kind ec_group_kind, description,
  -- The eligibility ring. Women's Ministry's parent = the "Women" roster group.
  -- "Notify others who could be invited" = parent members NOT already in this group.
  parent_group_id  UUID REFERENCES groups(id) ON DELETE SET NULL,
  -- Private groups don't appear in the group directory to non-members.
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  leader_profile_id, is_active, created_at, updated_at
)

group_members (
  id, group_id, profile_id, role ec_group_member_role,
  joined_at, added_by_profile_id,
  UNIQUE (group_id, profile_id)
)
```

`parent_group_id` is what makes the girls-night case work without storing anyone's
gender. Staff maintain a **"Women"** roster group (a `kind='age_stage'`-style roster with
no events of its own) and a **"Women's Ministry"** activity group whose parent is
"Women". A girls-night event targets Women's Ministry; the optional wider ring is
"Women". Men are in neither, so they never resolve into the read set or the recipient
set. Nothing about a person's gender is inferred or stored — it's church-curated,
auditable membership.

`serve_teams` (migration 006) stays as-is. Rather than a risky backfill, phase 1 ships a
one-click "create a group from this serve team" action that copies name/campus/leader; a
`groups.serve_team_id` link column is included so the two can stay associated.

**SQL helpers** (used by RLS so the database and the app can never disagree):

```sql
ec_is_group_member(gid UUID) RETURNS BOOLEAN   -- STABLE, SECURITY DEFINER
ec_visible_group_ids()       RETURNS SETOF UUID
```

RLS: same-church staff read all; any authenticated same-church profile reads non-private
groups (the directory); private groups readable only by members + staff. Writes are
`campus_admin+`, plus a group leader may manage their own `group_members`.

## 3. Migration 027 — events

```
ec_event_status      ENUM: draft | published | cancelled | hidden
ec_event_visibility  ENUM: public | private
ec_event_channel     ENUM: web | sms | admin
ec_invite_ring       ENUM: members_only | members_plus_eligible | church_wide
ec_rsvp_status       ENUM: going | maybe | not_going | waitlist

event_types (
  id, church_id, name, slug, color, icon, description,
  -- Home Group defaults to private; Creation Night / Prayer Set to public.
  default_visibility ec_event_visibility,
  -- Marks the type as normally home-hosted: drives the default_visibility
  -- above and the publish-an-address confirmation in §8.
  default_is_private_residence BOOLEAN,
  is_active, order_index
)
-- Seeded per church: Home Group, Creation Night, Prayer Set, Get-together.
-- Church-configurable, exactly like appointment_types.

events (
  id, church_id NOT NULL, campus_id NULL, event_type_id NOT NULL,
  title, description,
  starts_at, ends_at, timezone NOT NULL DEFAULT church tz, all_day BOOLEAN,
  recurrence_rule TEXT NULL,              -- RFC 5545 subset, phase 4

  -- WHO CAN SEE. Binary. Private events draw their audience from
  -- event_audiences ∪ event_invites, or the whole church if
  -- audience_is_church_wide.
  visibility ec_event_visibility NOT NULL,
  audience_is_church_wide BOOLEAN NOT NULL DEFAULT FALSE,
  -- WHO GETS NOTIFIED. Orthogonal to visibility — see §4.1.
  invite_ring ec_invite_ring NOT NULL DEFAULT 'members_only',
  status ec_event_status NOT NULL DEFAULT 'draft',

  host_profile_id NOT NULL, cohost_profile_id NULL,

  location_name, address_line1, address_line2, city, region, postal_code,
  lat NUMERIC(9,6), lng NUMERIC(9,6),
  is_private_residence BOOLEAN NOT NULL DEFAULT FALSE,
  hide_address_until_rsvp BOOLEAN NOT NULL DEFAULT FALSE,
  scheduling_location_id NULL, scheduling_booking_id NULL,

  capacity INT NULL, rsvp_required BOOLEAN, rsvp_deadline NULL,
  image_url NULL,

  pinned_at NULL, pinned_by_profile_id NULL,      -- admin/connector only
  published_at NULL,
  cancelled_at NULL, cancellation_reason NULL, cancelled_by_profile_id NULL,
  hidden_at NULL, hidden_reason NULL,

  created_by_channel ec_event_channel NOT NULL DEFAULT 'web',
  inbound_message_id NULL,                        -- set when created by text
  created_at, updated_at,
  CONSTRAINT chk_event_range CHECK (ends_at > starts_at)
)

event_audiences (event_id, group_id, UNIQUE (event_id, group_id))
event_invites   (event_id, profile_id, invited_by_profile_id, ...)  -- named individuals
event_rsvps     (event_id, profile_id, status ec_rsvp_status, guest_count INT DEFAULT 0,
                 responded_at, UNIQUE (event_id, profile_id))
event_reports   (event_id, reporter_profile_id, reason ec_report_reason, note,
                 created_at, resolved_at, resolved_by_profile_id,
                 resolution ec_report_resolution,   -- restored | cancelled | host_blocked | no_action
                 UNIQUE (event_id, reporter_profile_id))
event_notification_batches (event_id, requested_by_profile_id, ring, audience_summary JSONB,
                            recipient_count, sms_count, email_count, skipped_count,
                            created_at, sent_at)
```

Indexes that matter: `(church_id, starts_at)` for the hub's window query,
`(status, starts_at) WHERE status='published'`, `(host_profile_id)`,
`(pinned_at) WHERE pinned_at IS NOT NULL`.

Every migration ends with `NOTIFY pgrst, 'reload schema';`. All the enums here are fresh
`CREATE TYPE`, so the migration-014 `ALTER TYPE ... ADD VALUE`-inside-a-transaction
gotcha doesn't apply.

## 4. The audience filter — one chokepoint, two callers

This is the part that must not have a second implementation. The read path (who sees the
event) and the notify path (who gets texted) resolve audience from **the same rule**. Two
implementations is exactly how the men end up seeing girls night.

The rule lives in Postgres:

```sql
CREATE FUNCTION ec_can_see_event(e_id UUID) RETURNS BOOLEAN AS $$
  -- staff override: platform admin, or same-church connector+ (per the user's
  -- "unless they are a connector/admin")
  -- host / cohost always
  -- status: draft   → host+cohost+staff only
  --         hidden  → staff only
  --         cancelled → same audience as published, rendered with a banner
  --         published → fall through to visibility
  -- visibility: public  → TRUE, full stop. No auth, no church scoping.
  --             private → same church AND (
  --                         audience_is_church_wide
  --                         OR member of any group in event_audiences
  --                         OR named in event_invites )
$$ STABLE SECURITY DEFINER;
```

The binary collapse is a real safety win, not just less typing: 4 visibility states × 2
query paths (RLS + anonymous) was 8 combinations that each had to be right. Now it's 4,
and the anonymous path reduces to a single boolean — `visibility = 'public' AND status =
'published'` — which is about as hard to get wrong as this gets.

**No implicit church-wide default.** `audience_is_church_wide` is an explicit flag, not an
empty-audience fallback. If "private with no groups picked" silently meant "everyone at
the church," then forgetting to pick a group would fan a private event out to the whole
congregation — the exact failure this model exists to prevent. The create form offers
"Everyone at my church" as a deliberate choice, and a private event with no audience at
all can't be published.

### 4.1 Visibility and the notify ring are different questions

`visibility` answers *who can see this*. `invite_ring` answers *who gets told*. Keeping
them separate is what makes "invite those who might be left out" work: a private
Women's-Ministry event can notify the wider "Women" eligibility ring, which is the whole
point of `parent_group_id`.

That creates one trap worth naming. If the ring gets a text but isn't in the read
audience, the link in that text lands on a 403 — you've invited someone to something they
can't see. **Fix: selecting `invite_ring='members_plus_eligible'` automatically adds the
parent group to `event_audiences`.** One source of truth, and notify-without-access
becomes structurally impossible rather than a rule someone has to remember.

- The `events` **RLS SELECT policy is just `ec_can_see_event(id)`**. Hub queries carry no
  visibility `WHERE` clause at all — forgetting one becomes impossible.
- `lib/events/audience.ts` exports the notify-side twin:
  - `resolveEventAudience(admin, eventId, ring)` → recipient profiles, built from the
    same group-membership join, then passed through the delivery/consent gate (§6).
  - `previewEventAudience(...)` → counts only, for the create form: *"Publishing notifies
    38 people — 26 by text, 12 by email, 9 skipped (no SMS consent)."* The host sees the
    count, never the roster.
- The anonymous path does **not** use RLS (no `auth.uid()`); it uses the service-role
  client with an explicit, hardcoded `visibility='public' AND status='published'` filter.
  It returns the event in full — address included — but drops the RSVP roster and the
  host's contact details (§8). That's the one place with a second query; it lives in a
  single function, `listPublicEvents()`, and is the highest-value thing in the codebase to
  test.

**Test matrix** (worth writing before the UI): for each of `{non-member of the targeted
group, member, group leader, connector, campus admin, host, anonymous}` × `{public,
private-to-groups, private-church-wide, private-invite-only}` × `{draft, published,
cancelled, hidden}`, assert visible/invisible, address-revealed/hidden, and
can-report/cannot. Run it against the RLS path, `listPublicEvents()`, and
`resolveEventAudience()`, and assert all three agree. The girls-night case is one row in
this table; so is "the eligibility ring can open the link it was texted."

## 5. Lifecycle: create, cancel, report, pin

All in `lib/events/actions.ts`, all emitting `recordAudit`.

**Create → published (trust-then-verify).** Eligibility to host: an active same-church
profile that has been through the connect platform — concretely
`participants.status IN ('connected','completed')`, or any staff/connector role. Draft is
available for "save and finish later"; publishing is the act that triggers fan-out.

**Cancel.** Host, cohost, or admin. Sets `status='cancelled'` + reason; the event stays
visible to its prior audience with a strikethrough banner (so nobody shows up to a
cancelled home group), and everyone who RSVP'd `going`/`maybe` gets
`event_cancelled_to_rsvps`. Cancelled events drop off the calendar after their end time.

**Report → hidden + admin SMS.** Uniform across every event, with no host-privilege
carve-out. First report sets `status='hidden'`, `hidden_at`, and enqueues
`event_reported_to_admin` to every church/campus admin with a phone. Restore is one click
from `/hub/review`.

**Reporting is gated by visibility, and that's what makes it safe.** You must be
authenticated and able to see an event to report it — the check is literally
`ec_can_see_event`, the same function the read path uses. Consequences fall out for free:

- A **public** event can be reported by any authenticated member. Correct — public events
  are the ones strangers see and the ones with the largest blast radius if illegitimate.
- A **private** event can only be reported by its targeted audience: curated, named,
  auditable people. A report from inside a small group isn't griefing, it's high signal.
- Anonymous visitors can browse public events but cannot report. Unaccountable reporting
  is a griefing vector with no upside.

`UNIQUE (event_id, reporter_profile_id)` caps it at one report per person, and every
report is attributable in `event_reports`.

Residual risk, honestly stated: one determined member can still hide events repeatedly
and make an admin restore them. The cheap guard — worth adding in phase 2, not phase 1 —
is an **abuse-history check on the reporter**: once someone's last three reports have all
resolved to `no_action`, their reports stop auto-hiding and only raise a flag. That
targets the actual bad actor instead of privileging staff, which is the better shape of
the same protection.

**Pin.** `pinned_at` / `pinned_by_profile_id`, `campus_admin+` only. Pinned events render
in a strip above the hub views and sort first in list view. Pinning does not change
visibility — a pinned group event is still group-scoped.

**Admin review queue** at `/hub/review`: reported + hidden events with Restore / Cancel /
Block host, each writing an `event_reports.resolution`.

## 6. Notifications — and one compliance gap to close first

Reuses `notification_outbox` + the existing drain and Twilio/Resend senders. Additions:

**Migration 028 — profile SMS consent** (shipped; the rest deferred to 029)

The consent columns were split out and shipped ahead of the fan-out, because
nothing else could safely be built on top of them:

```
-- 028_profile_sms_consent.sql (applied file, not yet run against a database)
ALTER TABLE profiles
  ADD COLUMN sms_consent_at TIMESTAMPTZ,
  ADD COLUMN sms_consent_source TEXT;
```

**Migration 029 — notification plumbing for events** (phase 2)

```
ALTER TABLE notification_outbox
  ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  ADD COLUMN recipient_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE notification_settings
  ADD COLUMN event_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN event_reminder_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN event_host_daily_recipient_cap INT NOT NULL DEFAULT 250;
```

> **This is a blocker for any event SMS, and it's worth being blunt about it.** The
> outbox is keyed on `participant_id`, and SMS consent lives on
> `participants.sms_consent_at` (migration 017). Event recipients are **profiles** —
> including staff, connectors, and members who never went through the participant signup
> form. `profiles` has a `phone` column (migration 018) and **no consent column at all**.
> Fanning events out over SMS before adding `profiles.sms_consent_at` would text people
> who never opted in — a 10DLC/TCPA problem, not just a product wart. So migration 028
> adds it, and `resolveProfileDelivery()` (the sibling of the existing
> `resolveParticipantDelivery`) enforces consent + phone presence at enqueue, keeping the
> single-chokepoint property the notification layer already has. Members need a consent
> checkbox somewhere they'll actually see it — profile settings, and a one-time prompt
> the first time they RSVP or host.

New template keys in `lib/notifications/types.ts`:
`event_published_to_audience`, `event_cancelled_to_rsvps`, `event_reminder_to_rsvps`,
`event_rsvp_to_host`, `event_reported_to_admin`. Hardcoded fallback bodies as usual, so
churches can override without a deploy.

Idempotency key `event_publish:<event_id>:<profile_id>` means republishing or a retried
drain can't double-blast. `event_host_daily_recipient_cap` bounds what one member can do
with the church's SMS line in a day — both a spam guard and a Twilio-bill guard.

Reminder sweep: new cron `/api/cron/events-reminders`, same `CRON_SECRET` guard as the
existing three, wired in `vercel.json`.

## 7. Creating an event by text (phase 3)

`POST /api/sms/inbound`, Twilio webhook.

1. **Validate `X-Twilio-Signature`** against the auth token before touching the body.
   Non-negotiable — without it the endpoint is an unauthenticated event-creation and
   SMS-fan-out trigger for anyone who finds the URL.
2. `inbound_messages` row (migration 029): `church_id`, `from_phone`, `body`,
   `twilio_message_sid UNIQUE` (replay protection), `matched_profile_id`, `intent`,
   `parsed JSONB`, `event_id`, `status`, `created_at`.
3. **Identify the sender** by normalizing to E.164 and matching `profiles.phone` then
   `participants.phone`. No match → a polite "we don't recognize this number, sign up at
   …" and stop. Match but hasn't been through the platform → reply pointing at their
   journey. This is where the "any user that has been through the connect platform" rule
   is enforced.
4. **Parse** with the AI SDK through AI Gateway into a zod schema (title, event type,
   date, time, duration, location, target group, invite ring). Missing or ambiguous
   fields → one SMS clarifying question, with conversation state on the
   `inbound_messages` row.
5. **Never publish straight from a text.** Reply with a summary and either "reply YES to
   publish" or a magic link to the prefilled review page. Group targeting in particular
   should be confirmed on a screen where the recipient count is visible — the whole point
   of the audience preview is that the host sees who they're about to reach.
6. Rate-limit per phone. Conversational replies send directly through the Twilio sender
   (an answer to an inbound message is solicited); they never add anyone to a broadcast
   list.

## 8. UI

`app/page.tsx` becomes the hub. It currently redirects authenticated users via
`landingForSession` — that goes away; `defaultHomeFromGroups` and `landingForSession`
return `/`, and `/dashboard`, `/connector`, `/journey` stay reachable from the nav
(which gains a **Hub** item in every group).

Anonymous `/` is a **first-class events browser, not a teaser** — the same calendar and
list views over public events, with real event detail pages, since "a place where the
public can see upcoming events" is a goal in its own right. What anonymous visitors don't
get: RSVP (prompts sign-in), reporting, hosting, and any private event. Today's hero +
login card moves below the events, or into the header.

> **Open assumption — anonymous church resolution.** URLs carry no church slug
> (`churches.slug` is reserved for future subdomains), so anonymous `/` has no tenant
> context. Plan: resolve in order — `?church=<slug>` → a `last_church` cookie set by any
> visit to `/c/[slug]` → the single active church if only one exists → otherwise fall
> back to today's login-only hero with a link to `/signup`. That's correct today (one
> real church) and degrades sanely later. The clean long-term answer is
> `/c/[slug]/hub` as the canonical public URL, or subdomains.

Routes:

```
/                 hub — ?view=calendar|list  ?type= ?campus= ?group= ?from= ?q=
/hub/e/[id]       event detail — RSVP, address reveal, report, host edit/cancel, admin pin
/hub/new          create event
/hub/e/[id]/edit  host/admin edit
/hub/review       admin queue: reported + hidden events
/groups           directory + admin CRUD
/groups/[id]      members; leaders manage membership
```

URL-as-state server components throughout, matching the existing participants-list
pattern (server-paginated, filters preserved in query params).

**Calendar reuse.** `components/dashboard/month-calendar.tsx` is good and nearly
generic — it's coupled to `CalendarEvent` from `lib/dashboard/queries`, `colorForEvent`
from `lib/dashboard/colors`, hardcoded "appointments" copy, and `/participants/[id]`
links. Extract it to `components/calendar/month-calendar.tsx` over a generic
`CalendarItem { id, title, starts_at, ends_at, color, href, subtitle, location }`, leave
a thin adapter behind on `/dashboard` so that page's behavior is unchanged, and feed the
hub the same component.

**What "public means all information" does and doesn't cover.** A public event shows
everything about *the event* — title, description, full address, host name, time — to
anyone, no login, and it should be search-indexable, because a church wants its events
findable. Two carve-outs, both about other people's data rather than the event's:

- **The RSVP roster is never public.** Public pages show a count ("14 going"), not names.
  Who attends is the attendees' information, not the host's to publish.
- **The host's phone/email is never public.** Contact runs through an in-app "message the
  host" action so a member's mobile number doesn't end up on the open internet.

**Home addresses.** `hide_address_until_rsvp` stays, but under the binary model it only
does anything for **private** events: pre-RSVP viewers see neighborhood + city, and the
full address lands on the detail page after RSVP and in the confirmation message. On a
public event the address is simply public — that's what public means, and it's the right
default for a church building or a park.

The consequence needs to be legible at the moment of choosing, not buried in a settings
page: marking a **home-hosted** event public puts a member's home address on the open
internet, un-gated and crawlable. So `event_types.default_is_private_residence` makes
home-group events **default to private**, and choosing "public" on an event flagged
`is_private_residence` shows a plain-language confirmation — "this will publish
1234 Maple St to anyone on the internet, including people outside the church" — rather
than a generic warning icon. The host can absolutely still do it; they just do it knowing.

The reveal gate itself belongs in the query layer, not the template, so a future map view,
ICS export, or JSON feed can't leak an address by forgetting to apply it.

## 9. Phasing

**Phase 1 — schema + read path.** Migrations 026, 027. `ec_can_see_event` + RLS.
`lib/events/{types,queries,services,audience}.ts`. Hub at `/` with list + calendar,
event detail, RSVP, groups CRUD, event-type seeding. Publishing is **silent** — no
notifications yet. Ends with the §4 visibility test matrix green.

**Phase 2 — write path, lifecycle, notifications.** Migration 028 (including
`profiles.sms_consent_at`). Create/edit/cancel/report/pin, audience preview, fan-out
through the outbox, member consent capture, reminder cron, `/hub/review`, and the
reporter abuse-history guard from §5.

**Phase 3 — event creation by text.** Migration 029. Signature-validated webhook, sender
identification, AI parsing, two-step confirmation.

**Phase 4 — map + recurrence.** Provider choice (MapLibre + keyless tiles is the cheap
default), geocode-on-save into the existing `lat`/`lng`, fuzzed pins for private
residences, recurring events via `recurrence_rule`.

Phase 1 is self-contained and useful on its own: the church can see every gathering in
one place even before anything sends.

## 10. Before writing code

- Read the relevant guides under `node_modules/next/dist/docs/01-app/` — this Next 16
  differs from training data (`AGENTS.md`). Specifically the data-fetching / caching
  guide for the hub's window queries, Server Actions for the lifecycle mutations, and
  the file-conventions docs for `proxy.ts`.
- `requireStaff()`-style gates go at the top of every new page, not only in layouts
  (partial rendering makes layout checks insufficient — the existing convention).
- New tables are church-scoped via `church_id NOT NULL`, per the standing rule.
- Don't touch `/lib/scheduling/` or `/app/scheduling/`.

---

## 11. Build status (2026-08-17)

### Shipped

**Migrations** (files written; **not yet run against any database** — Docker was
off, so `supabase db reset` hasn't validated them):
- `026_groups.sql` — `groups` (with `parent_group_id` eligibility ring,
  `serve_team_id` link), `group_members`, helpers `ec_is_group_member`,
  `ec_my_group_ids`, `ec_is_group_leader`, RLS.
- `027_events.sql` — all six enums, `event_types` (seeded per church: Home Group,
  Creation Night, Prayer Set, Get-together), `events`, `event_audiences`,
  `event_invites`, `event_rsvps`, `event_reports`,
  `event_notification_batches`, `ec_can_see_event`, `ec_can_host_events`, RLS
  across every table.
- `028_profile_sms_consent.sql` — `profiles.sms_consent_at` +
  `sms_consent_source`, deliberately not backfilled.

**Domain layer**
- `lib/events/types.ts` — including `ViewerEvent`, the post-reveal-gate shape the
  UI consumes.
- `lib/events/queries.ts` — `listHubEvents` (RLS-enforced, no visibility clause),
  `listPublicEvents` (the single anonymous path), `getEvent`, `listEventTypes`,
  and `revealAddress` — the address gate, in the query layer.
- `lib/events/audience.ts` — `resolveEventAudience`, `previewEventAudience`,
  `materializeEligibilityRing`.
- `lib/events/actions.ts` — `createEvent`, `rsvpToEvent`, `cancelEvent`,
  `reportEvent`, `resolveEventReport`, `setEventPinned`, `canHostEvents`.
- `lib/groups/queries.ts` — `listGroups`, `listMyGroups`, `getGroup`,
  `listGroupMembers`.
- `lib/notifications/enqueue.ts` — `resolveProfileDelivery`, the consent gate for
  profile-addressed sends.
- `lib/church/public-church.ts` + `public-church-cookie.ts` — anonymous tenant
  resolution; the cookie is written in `proxy.ts` (Server Components can't).

**UI**
- `components/calendar/month-calendar.tsx` — the dashboard calendar generalized
  over `CalendarItem`; `components/dashboard/month-calendar.tsx` is now a thin
  booking-shaped adapter, so `/dashboard` needed no edits.
- `app/page.tsx` — the hub. Authenticated full view and anonymous public browser,
  calendar + list, filters by type/group/campus/month.
- `app/hub/e/[id]/` — detail page with RSVP, report, and host cancel.
- `app/hub/new/` — create form, including the plain-language confirmation before
  a home address goes public.
- Nav gains a Hub item; `landingForSession` and `defaultHomeFromGroups` now
  return `/`.

Typecheck, lint, and `next build` are clean.

### Not built yet (remaining phase 1)

- **`/groups` admin UI.** The domain layer and RLS are done, but there's no
  screen to create a group or manage membership — so the girls-night case can't
  be exercised end to end until groups exist. Highest-value next piece.
- **`/hub/review`.** `resolveEventReport` exists and is wired; the admin queue
  screen that calls it doesn't. Reported events currently go hidden with no UI
  to restore them (a direct DB update works in the meantime).
- **Event edit page.** Hosts can cancel but not edit.
- **The §4 visibility test matrix.** Nothing is asserted yet. This is the thing
  that should exist before anyone trusts the audience rule, and no part of it is
  written.
- **Drafts on the hub.** `listHubEvents` filters to
  `status IN ('published','cancelled')`, so a host's own draft is reachable only
  by direct link. The create form always publishes, so no draft is currently
  reachable at all.

### Known gaps carried forward

- Migrations are unrun. First `supabase db reset` will be the real test —
  particularly `ec_can_see_event`'s plpgsql and the seeded `event_types` insert.
- No notifications of any kind fire for events (by design in phase 1). The
  create form says so explicitly rather than implying a text went out.
