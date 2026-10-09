# Encounter Connect — the rethink (October 2026)

**Status:** proposed 2026-10-08. Nothing in this document is locked. §12 lists the decisions
only the founder can make and the checks that must happen before any code moves.
This supersedes the *phasing* in `docs/connection-hub-plan.md`; that plan's design
decisions stand except where §9 says otherwise.

**How it was made.** Three code readers mapped the repo as it is today. Six independent
rethinks were written from six lenses (admin-first, the person walking in, network-first,
trust-first, leverage-first, gatherings-as-the-atom). Three judges scored all six. One
synthesis was written from the winner with the judges' grafts. Five adversarial critics
then attacked the synthesis (scope, heartbeat, second-church adoption, safety and privacy,
and a fact-checker who verified 29 code claims line by line). What follows is the
integration of all of that, with the critics' corrections applied.

---

## 1. What this is

The founder's words, kept whole: *keep the vibes always local, but be able to connect
with other parts of the body. A mapped event, gathering, meeting for the local church,
where people can make new events or browse what is going on in their vicinity. Usher
guests into service, giftings, and callings as soon as possible. Help churches, regardless
of their onboarding process, keep this portion of ministry on track. Train new members,
schedule meetings, coordinate events. The admins of the churches will be the main users.*

So this is what Encounter Connect becomes:

> **A map of the body, run by local churches.** Scan the QR on Sunday and you land on a
> map of your church's week, centered on your campus. Pinch in and you are on your street;
> pinch out and other churches appear as pins. Tap a home group: Lydia is hosting, your
> friend from the lunch is going, "Going" reveals the address, "bring a friend", "message
> Lydia", "add to calendar". A newcomer has a real person's name by Thursday because the
> first meeting is booked against a volunteer's real availability. The admin's Monday email
> says who is new, who nobody has reached, who met their connector, who is at a table, who
> is serving, and who hosted for the first time. The same tool works for a church that runs
> Encounter's five-step journey, a church whose on-ramp is a lunch and a phone call, and a
> church that runs no journey at all.

Three faces on one codebase:

| Face | Who | What it is |
|---|---|---|
| **This week** | church admins, campus admins, connections pastors | The console that answers "is our connect ministry on track this week?", plus a Monday digest for the admin who will never form a login habit. |
| **The Hub** | members, hosts, connectors, newcomers | Calendar, list and **map** of gatherings, scoped to *my church* by default; the journey (optional); the connector workspace. |
| **The front door** | guests and the wider body | Anonymous `/` is the map of the hint church with other churches as pins on zoom-out; `/c/[slug]` is each church's public page. |

### What it is not

- **Not a social network or a feed.** No cross-church people directory, no following, no
  timeline. The wider body appears as church pins, public gathering pins and counts.
- **Not the church's calendar of record or volunteer scheduler.** Sunday services and serve
  shifts stay in Planning Center or wherever they live. Service times are display text on
  the public page. The hub holds connect-ministry gatherings, member get-togethers and
  home groups *if the church wants them here*. A Planning Center church may leave its home
  groups in Church Center; this is stated to them, not discovered by them.
- **Not a chatbot, a pastoral-care system or a denomination org chart.** The chat-first
  front door, care requests and the care log stay a future door on this same codebase; no
  network objects, stewards or third visibility tier are added.
- **Not a rewrite.** Same Next 16 + Supabase app, SchedulingCore untouched as the 1:1
  engine, every change additive.
- **Not a map of homes or people.** No person is ever a pin, no viewer location is stored,
  and a home's pin is never sharper than what its own page shows.

---

## 2. The shape: four rings, one boundary

```
  ┌──────────────────────────────────────────────────────────────┐
  │ Ring 3  THE BODY     verified churches as pins + counts       │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ Ring 2  NEARBY     public gatherings of other verified  │  │
  │  │                    churches within a radius             │  │
  │  │  ┌──────────────────────────────────────────────────┐  │  │
  │  │  │ Ring 1  MY CHURCH   everything church-scoped:    │  │  │
  │  │  │   people, stages, connectors, journey, groups,   │  │  │
  │  │  │   gatherings, reports, notifications, audit      │  │  │
  │  │  │  ┌────────────────────────────────────────────┐  │  │  │
  │  │  │  │ Ring 0  MY GROUPS   private gatherings      │  │  │  │
  │  │  │  │   audience = explicit groups + invites      │  │  │  │
  │  │  │  └────────────────────────────────────────────┘  │  │  │
  │  │  └──────────────────────────────────────────────────┘  │  │
  │  └────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
            ▲ the only boundary data crosses: a PUBLIC gathering,
              a church's own pin, and (phase 3) an explicit co-host row
```

- **Ring 0 and 1 are what exist today**, enforced by `church_id NOT NULL`, `ec_current_church_id()`
  and `ec_can_see_event()`. Every write in the product happens in ring 1.
- **Ring 2 (Nearby)** is a *read path, not an identity change*. Public gatherings are already
  church-agnostic at the RLS level: `ec_can_see_event` returns TRUE for a public, published
  gathering before any church check, and the RSVP policy's WITH CHECK is that same function,
  so a member of Grace can already RSVP to Encounter's public prayer night. Nearby adds
  coordinates and one service-role SQL function with the public predicate hardcoded, the
  same lane `listPublicEvents` already uses. Nothing in ring 2 ever notifies anyone.
- **Ring 3 (the Body)** is churches as pins with "N public gatherings this month". No
  individual events beyond city zoom, no people. City, state, country and world are zoom
  levels and radii, not organizations.
- **Churches relate to each other** by geography (pins and public gatherings), later by
  explicit co-host rows on a public gathering, and by sharing onboarding packs as deep
  copies. There are no networks, no stewards, no shared member directories.
- **What never crosses a church line:** participants, progress, assessment responses and
  results, connector assignments and notes, meeting notes, group rosters, private gatherings
  and their audiences, RSVP rosters, phone, email, consent, audit rows, and care data when
  it exists. The one deliberate exception is user-initiated: in phase 3 a person who moves
  churches may *choose* to bring their own story (their gifts results, a one-line intro)
  to the new church's connector. The church's records never copy; the person's own data is
  theirs to carry, which is the vault rule from the chat vision.

**Identity.** One auth user, one profile. Through phase 2 a person has one home church
(as today). Phase 3 adds `church_memberships` so a person can hold roles in several
churches without being re-homed. The migration path is known and small: the table is
backfilled 1:1 from `profiles`, `profiles.church_id` is reinterpreted as "the church I am
acting in", and `ec_current_role()` is redefined with the same signature so the ~40
policies that call it stay textually unchanged. It waits for phase 3 because the matrix
of tests that proves it safe does not exist yet, and because cross-church *public* reads
and RSVPs need no identity change at all.

---

## 3. The people

| Persona | Job to be done | Home |
|---|---|---|
| **Church admin / connections pastor** | See who is new, uncontacted, met, at a table, serving, stuck; celebrate first-time hosts; reach the regular nobody has seen in a month; onboard the church in an afternoon. A shepherd first, an operator only when a report lands. | *This week* and the Monday digest |
| **Connector** (volunteer guide) | Meet newcomers fast, run the first meeting, hand the person a concrete next step. Not a data-entry caseworker: the booking, the meeting and every message sent count as contact automatically. | `/connector` |
| **Newcomer** | A real person's name within a week; whatever on-ramp the church runs; exactly where to show up next. | `/journey` (optional) and the hub's "next up" card |
| **Member and host** (Katelyn) | See what my church makes visible to me, RSVP, bring a friend, host my own gathering, vouch for a newcomer, own my phone, consent and password. | `/` (calendar, list, map), `/hub/e/[id]`, `/hub/new`, `/account` |
| **Group leader** | Keep the roster accurate (the private-visibility model depends on it), see who is coming, repeat the Tuesday gathering without re-creating it. | `/groups/[id]` |
| **Guest** | Browse what a church near me is doing in public, open a real event page, say "Going?" and get an account at that church at that moment. | anonymous `/` map, `/c/[slug]`, `/hub/e/[id]` |
| **Platform admin** (the founder) | Create a church, invite its first admin by email, verify it, list it on the map, rehearse on the test tenant. Never moderate a church's gatherings for it. | `/platform/*` |

---

## 4. What changes structurally

Each item: what, why (verified in code), how, risk. Line references are to today's files.

1. **Close the cross-tenant doors before church #2 has data.** Migration 002 lets *any*
   authenticated user read every church's `scheduling_locations`, `scheduling_resources`
   (which carry connector email and phone) and public appointment types; migration 007
   (lines 29–36) grants any `church_admin` read *and update* on every church's appointment
   types; `app/api/scheduling/*` routes use the service-role client with no auth and sit
   outside the proxy matcher; `app/scheduling/actions.ts` is ungated service-role. Policies
   OR together, so this cannot be fixed by overlay. **Fix:** a policy-only migration that
   drops and recreates those reads church-scoped (migrations 007 and 020 already altered
   these tables, so the "don't touch scheduling code" rule is honored), the proxy gating
   `/scheduling/*` to platform admins and its matcher covering `/api/scheduling/` as a
   prefix, and the journey's non-auto-match schedule step no longer dropping participants
   into the raw scheduling UI. **Needs the founder's one-time sign-off (§12, Q1).**

2. **Finish the never-applied hub migrations in place, then freeze them.** 026/027/028 have
   never run against any database (prod is believed to be on 025; verify, §12). Editing them
   is free today and impossible after the first prod apply. Changes while they are editable:
   - move `address_line1/2`, `postal_code`, `lat`, `lng` into an `event_addresses` child
     table with its own SELECT policy, so the "address after RSVP" gate lives in Postgres and
     not only in `revealAddress()` (today RLS hands every audience member the raw columns and
     one PostgREST call reads a gated home address without RSVPing);
   - add `events.public_lat/public_lng` (the only coordinates any map or radius query reads),
     `events.series_id`, `event_rsvps.attended_at` + `checked_in_by_profile_id`,
     `groups.is_youth`;
   - make `events.host_profile_id` and `event_reports.reporter_profile_id` nullable with
     `ON DELETE SET NULL` so deleting an account does not erase other people's RSVPs and
     reports;
   - drop the literal `'America/Chicago'` default (the form never sends a timezone, so every
     event today is stored as Chicago regardless of the church);
   - explicit GRANTs.

3. **A one-time GRANT migration, dated.** `supabase/config.toml` leaves
   `auto_expose_new_tables` unset, which on a local `db reset` means *no* table from 001–028
   is reachable by anon, authenticated or service_role. The opt-out escape hatch is removed
   on **2026-10-30**. One migration granting on all existing public objects plus
   `ALTER DEFAULT PRIVILEGES` is harmless in prod and required locally.

4. **The admin's truth is a derived stage, not `participants.status`.** App code writes
   status only as `new` (signup), `connected` (`assignConnector`) and `completed` (journey
   end); `in_progress` is written only by the test seed. So today's dashboard pills and
   in-progress table are empty by construction, and `getPills`, `getNeedsAttention` and
   `NeedsAttentionPanel` have zero callers. **Fix:** a SQL function `ec_participant_stage()`
   returning *new / contacted / met / plugged in / serving / inactive* computed from facts
   that exist in phase 1: connector assigned; `participant_touches` (see 5); a completed
   meeting; membership in any non-serve group **or** an RSVP going / attended in the last 30
   days; membership in a group of kind `serve`. Thresholds 7 and 30 days ship as constants;
   60/90 wait for the phase-2 next-step object. Keep the enum only for the manual `inactive`
   override and for hosting rights, and write `connected` when a first meeting is
   **completed**, not when it is booked.

5. **A contact log that mostly writes itself.** `participant_touches`: one row per call,
   text, email, in-person contact or note, with a trigger maintaining
   `participants.last_contacted_at` (the `ec_touch_participant_last_action` pattern from
   006). System touches are written automatically from every outbox send to the participant,
   every booking confirmation and `meeting_started_at`; "Log a contact" is the one-tap for
   the personal call. The console reports "last heard from us" and "last personal contact"
   separately. Without this, "contacted" is hostage to volunteers opening the app to type.

6. **Places.** Campuses gain structured address + `lat/lng` (typed, or one geocode on save,
   with a pin drop). Gatherings get coordinates on create through a three-way choice,
   *At our campus / A public place / Someone's home*: the campus copies the campus pin, a
   public place geocodes once, a home is **never sent to a geocoder** and its `public_*`
   snaps to the campus pin. Churches store no coordinates of their own; the church pin is its
   primary campus. No PostGIS (a btree bounding box plus haversine is correct under ten
   thousand rows; PostGIS is a one-line swap behind the same function later). No cache
   table, no adapter framework.

7. **The journey becomes optional and later binds to real gatherings.** The Journey nav
   collapses (admin *and* participant side) when a church has no active flow;
   `journey_mode` (encounter | simple | none) is a real setting so "none" stops nagging; a
   two-step *Simple next steps* template (attend a gathering of type X, then meet a
   connector via auto-match) ships beside the Encounter template. Phase 2 adds
   `flow_steps.event_type_id` and `attendance_mode` so an "Attend event" step lists the next
   three visible gatherings of that type and a host check-in completes it through
   `completeStepAndAdvance`. Today the event step binds to an *appointment type* and
   "Mark attended" is self-reported.

8. **Two identity guards now, memberships later.** `signUpParticipant` upserts `profiles`
   with `onConflict:'id'` including `church_id`; the fact-check shows this only re-homes a
   never-confirmed existing account (a confirmed email returns "already registered" first),
   so it is a cheap guard, not a data-loss blocker. `ec_can_host_events()` has no church
   filter, so hosting standing earned at church A carries to church B; add the filter and
   `host_blocked_at`. `church_memberships` is phase 3 (§2).

9. **Members can join without becoming "new guests".** Today the only self-serve path
   creates a participant with status `new` and auto-enrolls it in the default flow, staff
   invites are restricted to staff roles, and bulk import was planned for phase 2. For a
   300-person church that means the console is either empty or reports the congregation as
   uncontacted newcomers. **Fix:** an "I already belong to this church" join path (profile
   plus a `connected` participant row, no enrollment), staff invites open to members, and
   CSV import of members *and* guests (with `signed_up_at`, so the 7-day clock is honest),
   in the church-#2 slice.

10. **Invites by email replace typed passwords and the hand-made first admin.** The first
    admin of a church is still created in the Supabase dashboard; staff invites create a
    user with a password the admin types and send nothing. `auth.admin.inviteUserByEmail`
    (or `generateLink` through the existing Resend sender) with the profile pre-created,
    landing on `/auth/confirm?next=/account`.

11. **Per-church voice.** The magic-link template, roughly twenty notification fallback
    bodies and `/terms` say "Encounter Connect"; there is no `{{church_name}}` variable; the
    seeded event types are Encounter jargon ("Creation Night", "Prayer Set") and drive the
    create form's defaults. **Fix:** `{{church_name}}` in the renderer, fallbacks signed by
    the church, a branded invite template, generic seeds (Home Group, Prayer Night,
    Newcomers Lunch, Get-together). The platform-name decision (§13) is a prerequisite of
    church #2's first email, not a post-launch flag.

12. **Notifications for gatherings ride the existing outbox.** The outbox's `participant_id`
    is nullable and `metadata` is JSONB; `enqueueAvailabilityReminders` already sends
    profile-addressed rows. Phase 1 adds three template keys (`event_cancelled_to_rsvps`,
    `event_reported_to_admin`, `admin_weekly_digest`) with hardcoded fallbacks and sends
    cancel and report notices **by SMS where consent and a phone exist on the existing line**,
    email otherwise. Publish fan-out, reminders and the per-host daily cap are phase 2, after
    the SMS line-of-record decision (§12, Q5). Honest copy replaces "anyone who RSVP'd will be
    told" and "an admin has been notified" until the sends exist.

---

## 5. The map

**What carries coordinates.** Campuses (admin-entered, the local anchor and the map's
default center). Gatherings, in two pairs: exact `lat/lng` in `event_addresses` (gated per
viewer by one policy and `revealAddress`) and `public_lat/public_lng`, the only pair a map
or radius query ever reads. Nothing else is ever a coordinate: not people, not connectors,
not a stored viewer location ("near me" is browser geolocation or a typed city, rounded to
two decimals in the browser, sent in a POST body, never in a URL, never logged).

**The rule in one sentence:** *a gathering's pin is never sharper than its own page.* If
the page shows the street address to this viewer, the map may show the exact pin to this
viewer. If the page withholds the address (private, address after RSVP), the pin is the
campus pin with a lock glyph and "address after RSVP". Never a random or deterministic
offset: offsets average out across reloads and still identify a home in low-density areas;
a campus pin cannot be reverse-engineered.

**Zoom levels.**

| Zoom | Shows | Never shows |
|---|---|---|
| country / state | verified, listed churches as clustered pins with "N public gatherings this month" | any individual gathering, any person |
| metro / city | campus pins; clustered public gathering pins (own church in phase 1, Nearby churches in phase 2, each card badged with church and distance); for a signed-in member, the private gatherings they are entitled to, at their `public_*` | drafts, hidden, cancelled after end time, rosters, host contact |
| neighborhood | individual pins at `public_*`; exact venue for public places; homes only as sharp as their page | unlisted, unverified or inactive churches |

**Scope.** *My church* by default, centered on the viewer's campus at city zoom. *Nearby*
(phase 2) widens to 10 / 25 / 50 miles as a chip carried in the URL. Anonymous `/` **is the
map**, centered on the hint church (`?church=`, the `ec_last_church` cookie, granted
geolocation, or the single verified church), with that church's public gatherings on
calendar, list and map exactly as today and other churches as pins on zoom-out; the
"which church?" chooser becomes a search box on the map, not the page. With one church it is
one pin, which is exactly "we are here, and this grows". A church is a pin when it is
active, has a pinned campus and is not the test tenant; `listed_on_map` and `verified_at`
are added the day church #2 exists.

**Implementation.** MapLibre GL with keyless OpenFreeMap or Protomaps tiles behind
`?view=map` on `/` and `/c/[slug]` (the placeholder already sits in
`components/events/hub-filters.tsx`), fed by a `MapPin` projection
`{id, title, public_lat, public_lng, color, href, gated}` and never by `ViewerEvent`
(which today carries `host_contact`). Mini-map on the detail page after reveal. Pins fill
as RSVPs arrive ("14 going").

---

## 6. The admin's Monday

The console stays in the `(ec)` shell with the role-grouped nav and the `require*` gates at
the top of every page, re-cut around one question: *is our connect ministry on track this
week?* Vocabulary is church language: **This week**; stages **new / contacted / met /
plugged in / serving**; verbs **Reach out, Introduce, Celebrate, Welcome as host**. Nothing
on the home screen reads as a CRM pipeline; conversion metrics live on `/reports`.

**This week** (`/dashboard`, replacing today's greeting, activity feed, booking calendar and
empty in-progress table), four panes:

- **On track.** Stage pills from `ec_participant_stage()` rendering the orphaned `Pills` and
  `NeedsAttentionPanel`: new this week, not yet contacted (7d), meeting this week, met,
  plugged in, serving; buckets *unassigned*, *not contacted in 7 days*, *stalled 14 days*,
  *meeting overdue*. Every pill links to `/participants?stage=`.
- **Meetings.** This week's connector 1:1s (from the existing `getMonthBookings`) and
  connector load (exists).
- **Gatherings.** This week's gatherings with RSVP counts and hosts, pinned items, a
  "reported" badge linking to `/hub/review` only when non-zero.
- **Celebrate and reach.** First-time hosts this month; regulars not seen at any gathering
  in 30 days (from RSVPs and `attended_at`); people whose connector has gone quiet; one-tap
  *Introduce to a group*, which is simply adding them to a group's roster and is what makes
  them "plugged in".

Trust (verification state, open reports, blocked hosts, SMS reachability) is a badge on
Settings and Review, not a Monday pane. Geocoding failures live on the campus settings page.

**The Monday digest** carries the same pills and buckets per church to admins by email
(connector copy behind a toggle, default off). When there is nothing to report it says so
once and offers the QR link and public page rather than sending zeros every week.

**People.** `/participants` keeps the paginated table but filters by derived stage and adds
*last contacted* and *next step* columns; `/participants/[id]` gains *Log a contact*,
*Introduce to a group*, *Welcome as host* and (phase 2) *Recommend a team*. `/people/invite`
sends an invite email and can invite members, not only staff. CSV import of the existing
congregation arrives with church #2.

**Gatherings.** The hub in *My church* scope; `/hub/review` with reported and hidden
gatherings and *Restore / Cancel / Block host* (block writes `host_blocked_at`, which
`ec_can_host_events` reads, so it actually blocks); pin/unpin; *View as visitor* opens
`/c/[slug]` so the admin sees exactly what the public sees; audience preview shows counts,
never a roster.

**Groups.** `/groups` directory and `/groups/[id]` roster for admins and leaders (and
readable by members of the group: roster names, leader, next gathering); *create a group
from this serve team*; staff-curated membership first, join requests in phase 2. A
composite *Start a home group* creates the group, sets the leader and materializes the
weekly gatherings in one step, because a church says "home group" for both the roster and
Tuesday night.

**Learn.** `/learn`: published lessons readable by every member, optionally targeted by
group (a *Hosts* group sees its lessons), so a church with no journey can still train. Three
platform lessons seeded per church: *How to host a gathering well* (five minutes, and the
gate for a first hosting, see §7), *Being a connector*, *Leading a small group*. This is
where "train new members" lives for every church, not only the ones running flows.

**Getting Started** (with church #2): a checklist built on `getDefaultFlowCoverage`: campus
pinned, event types reviewed, journey mode chosen (Encounter pack / Simple / none), a
Connect Meeting type bound, one connector with availability, staff invited, public page
published and QR downloaded, listed on the map or deliberately not. Nothing requires
Supabase, SQL or a template body.

---

## 7. Trust rules

Each rule names its one enforcement point. These are what an admin will repeat to a
congregation, so the code must actually enforce them.

1. **Churches are created by the platform admin and verified before they are listed.** No
   self-serve tenants (a phase-3 *bring your church* form creates an application, never a
   tenant). `listed_on_map` is a church-admin opt-in that takes effect only with
   `verified_at`. The test tenant can never be verified or listed.
2. **Hosting standing is per church and earned, with no admin queue by default.** Host =
   staff, or `trusted_host` marked by an admin, or a participant whose first meeting was
   *completed* at *this* church **and** who finished the five-minute host orientation
   lesson. `host_blocked_at IS NULL`. Trust-then-verify stays: hosts in good standing
   publish immediately. A church may turn on "first *public* gathering needs admin approval";
   the default is off everywhere.
3. **Homes.** The create form's three-way venue choice makes "someone's home" the default
   for anything that is not the campus or an affirmatively public place. A home gathering's
   address and exact pin reach only signed-in members who RSVP'd **going** (not "maybe"),
   through one Postgres policy and `revealAddress`; campus admins and above may see them,
   **connectors may not** (today every connector sees every home address). Home addresses
   are never sent to a geocoder. The founder-locked "I understand, this publishes 1234 Maple
   St to the open internet" confirmation stays, enforced server-side (today it is a
   client-side checkbox), only the host (not a cohost) may change visibility or address on a
   home gathering, and the whole path sits behind a church-level
   `allow_public_home_events` switch (§12, Q3).
4. **Rosters and names.** Counts only in public. Roster to host, cohost and staff; members
   of a private gathering's audience may see *who's going* (names only) once they have
   RSVP'd. Host display name is first name plus last initial to anonymous viewers,
   cross-church viewers, the Nearby functions and page metadata; full name only to signed-in
   members of the owning church. Host phone and email never reach a non-staff viewer;
   contact runs through an in-app *Message the host* relay via the outbox. "Your name will
   appear on the public page" is said at publish time.
5. **Reports.** Only people who can see a gathering can report it; one report per person;
   every report attributable. The first report **auto-hides only when the reporter has
   standing in the owning church** (connected or completed there, or staff) and a confirmed
   email; every other report is recorded and emailed to the owning church's admins without
   changing status. Restore is one click. Report, RSVP and host all require a confirmed
   email.
6. **Youth, from day one.** `groups.is_youth`: a gathering targeting a youth group must have a
   staff host, be private, and hide its address until RSVP; youth groups never appear in the
   member-targetable list or the public directory. No date of birth is collected anywhere.
7. **Moderation beyond one platform admin.** Each church moderates its own gatherings from
   `/hub/review`; reports on a public gathering route to the *owning* church's admins
   regardless of the reporter's church; the platform admin sees only cross-church
   safety-concern escalations and the verification queue. Audit rows for event actions carry
   the event's church, and the audit INSERT policy pins `church_id` to the actor's church.
8. **Messaging.** SMS only with `sms_consent_at` and a phone on file, enforced at enqueue
   for participants and profiles alike, consent source recorded, captured at signup and on
   `/account`. Nothing cross-church ever notifies. The per-host daily cap and idempotency
   keys land with the first broadcast fan-out, not after. STOP/START handled by a
   signature-validated Twilio webhook with event SMS.
9. **Data ownership.** The person owns their profile fields (`/account`: name, phone, email,
   password, consent; *delete my account* cancels their future gatherings, anonymizes their
   participant row, keeps an email hash on the audit row so a blocked host's re-signup is
   visible, then deletes the auth user; "your church keeps its ministry records" is said
   plainly). The church is the controller and the platform the processor; `/privacy` and
   `/terms` gain one paragraph each **in phase 1** naming what a public gathering publishes,
   the geocoder and tile provider, that "near me" is per-request and unstored, and that the
   operator can access church data to run the service. A one-page church agreement and an
   *Export our church* action (CSV/JSON of participants, touches, groups, gatherings, RSVPs,
   audit) arrive with church #2.
10. **The rules are tested.** A visibility and isolation suite is the release gate before the
    map ships and before any change to `ec_can_see_event` or the identity helpers. Phase 1
    ships about twenty assertions run locally before each prod apply (the girls-night case;
    anonymous vs private; other-church member vs private; audience member without RSVP
    cannot read `event_addresses` through PostgREST; `public_*` never equals a gated home's
    exact pin; scheduling tables unreadable across churches; host phone never reaches a
    non-staff viewer). The full viewers × visibility × status × code-path grid runs in CI
    with church #2.

---

## 8. Local to global, concretely

| Scale | What a person sees | Mechanism | Phase |
|---|---|---|---|
| **Street / neighborhood** | my church's gatherings, my groups' private gatherings | `ec_can_see_event` via RLS; `public_*` pins | 1 |
| **City** | my church's week on a map; *Nearby*: public gatherings of other verified churches within 10–50 miles, badged with church and distance; I can RSVP and the host sees "connected at Grace Church" (standing, not a vouch) | one service-role SQL function with `visibility='public' AND status IN (published, cancelled) AND listed AND verified` hardcoded, public-safe columns only | 2 |
| **State / country / world** | verified churches as pins and clusters with public-gathering counts; tap a pin, land on its public page; "I'm visiting" / "I'm moving here" create my account there at the moment of intent | church pins from campus coordinates; aggregates per map cell | 1 (pins), 3 (aggregates, intents) |
| **Between churches** | a public city-wide gathering on several churches' calendars; a church adopting another's onboarding pack; a person who moved bringing their own story | explicit co-host rows (one EXISTS arm in the staff branch of `ec_can_see_event`), deep-copied packs, user-owned fields | 3 |

What keeps the vibes local: every view opens on *my church*; Nearby is a chip in the URL,
not a stored preference; fan-out resolves only from the host church's groups and consent,
never from geography; private gatherings require real membership in that church; staff
powers require a staff role in that specific church.

---

## 9. Decisions already locked, and what this rethink does with them

| Decision (2026-08-17 unless noted) | Status here |
|---|---|
| `/` is the hub; anonymous visitors get a real, usable browser of public events | **Honored and strengthened**: anonymous `/` is the map of the hint church, not a chooser. |
| Binary visibility, public or private, no tiers | **Honored.** A third tier is rejected permanently. |
| Audience = explicit groups + membership; no demographic columns on profiles | **Honored.** `groups.is_youth` describes a roster, never a person. |
| Map deferred; schema stores lat/lng from day one | **Changed**: the own-church map moves into phase 1 because it is the spark; cross-church Nearby stays phase 2. |
| Trust-then-verify; a report hides and *texts* an admin | **Honored**, with the reporter-standing rule in §7.5 so a fresh account cannot hide a church's week. Report notices go by SMS where consent exists. |
| The host may knowingly publish a home address | **Honored** (server-enforced now), behind a church-level switch whose defaults the founder sets (§12, Q3). |
| No extra hosted Supabase project until church #2 (2026-07-31) | **Honored.** Local Docker stack + test tenant remain the validation path. |
| Chat-first front door and care requests after launch items (2026-07-31) | **Honored as sequencing**: deferred past phase 3; their seeds (`/account` per-field visibility, "no request dead-ends" in next steps, account-at-moment-of-intent) are built in. |

---

## 10. The build

Sizes are for one builder working with an AI coding agent, where a focused spec becomes a
day's work but review, migrations, prod applies and the Docker precondition are real. The
critics' honest estimate of the first synthesis was nineteen weeks for "phase 1"; this plan
splits it so something reaches Encounter every two to four weeks, and separates **what
Encounter needs now** from **what church #2 needs on day one**.

> **Build status, 2026-10-08** (branch `rethink/build`). The founder's §12 answers are
> applied. Slices 0 through 3 are built and tested; **nothing is applied to production
> yet**. The prod order is 029 first (it closes a self-escalation hole that exists today),
> then 026, 027, 028, 030, 031, 032, 033, 034, 035. See `docs/PROJECT_STATUS.md`.
>
> | Slice | Commit | State |
> |---|---|---|
> | 0 Ground | 090462a, bdf7b54 | Built. Migrations 029 (privilege lock), 030 (grants), 031 (tenant safety); proxy and API gates; signup guard. |
> | 1 The spark | 73cb43e | Built. Groups, places and the map, lifecycle and review, connection primitives, notices, legal paragraphs. |
> | 2 The admin's Monday | 1247a3e | Built. Contact log, derived stages, This week, nudges with campus-admin escalation (Q8), weekly digest, Learn, church settings. |
> | 3 Church #2 readiness | 5b52606 and the next commit | Built: invites, member join path, CSV import, `/account`, public page polish, sitemap, agreement, export, texting opt-out, Getting started, test tenants, runbook, CI matrix. |
>
> Where the build departs from the tables below:
> - **Tests** run on Node's built-in runner against the real migrations in PGlite
>   (Postgres compiled to WebAssembly), not vitest and not a Supabase container. The same
>   suite is the CI gate (`.github/workflows/ci.yml`), so items 5 and 26 need no Docker.
>   Adopting `supabase db push` still needs the one-time migration repair against prod.
> - **Members** (item 20): a self-declared member waits for an admin's confirmation, and
>   only the confirmation gives standing (status `connected`). An admin-confirmed member who
>   has done the host orientation can host, like someone whose first meeting is complete.
> - **Groups CSV import** (item 20) is the Groups column of the people import.
> - **The digest toggle** (item 16) lives in Church settings, with the digest day.
> - **First-public-gathering approval** exists as a setting but is not enforced or shown.
> - **STOP and START** are recorded through a signed Twilio webhook and when Twilio refuses
>   a send to an unsubscribed number.

### Slice 0 — Ground (about 2 weeks; one precondition is the founder's)

*Done when:* the hub work is on a branch and committed; migrations 001–028 run green on a
fresh local reset; 026–029 are applied to prod; a test-church participant cannot read
Encounter's scheduling rows; the twenty assertions pass.

| | Item | Size | Builds on |
|---|---|---|---|
| F | **Founder:** enable Docker Desktop WSL integration; confirm in the Supabase dashboard the prod migration level, whether the Default Church row is still active, and the Confirm-email setting | manual | `docs/ENVIRONMENTS.md` step 1 |
| 1 | Branch and commit the ~5,400 uncommitted hub lines; delete dead code (`/landing`, `/api/connectors`, the on-screen test password, the stale "shared across churches" footer) | S | git |
| 2 | One-time GRANT + default-privileges migration (before 2026-10-30) | S | `supabase/config.toml` |
| 3 | Revise 026/027/028 in place per §4.2 (`event_addresses`, `public_*`, `series_id`, `attended_at`, `is_youth`, SET NULL FKs, church timezone, GRANTs); first-ever `db reset`; apply to prod once | M | the three unrun migrations |
| 4 | Migration 029 tenant safety per §4.1; proxy and API gates; signup guard; `ec_can_host_events` church filter + `host_blocked_at`; `listHubEvents` takes a `churchId`; deactivate the Default Church seed | M | 002, 007, 020, `proxy.ts`, `lib/auth/signup-actions.ts` |
| 5 | One vitest file, ~20 assertions, run by hand before each prod apply | S | the test-data harness fixtures |

### Slice 1 — The spark (about 4 weeks)

*Done when:* Katelyn scans the QR and lands on a map of Encounter's week; a private home
group is visible only to its group, repeats weekly, shows who's going, and reveals its
address on "going"; a public gathering shows its exact venue; the home pin snaps to the
campus; reported gatherings land in `/hub/review` and can be restored.

| | Item | Size | Builds on |
|---|---|---|---|
| 6 | Minimal groups: create/archive, roster add/remove, leader, parent ring, *create from serve team*, youth guard, wired into the create form | M | 026, `lib/groups/queries.ts`, `new-event-form.tsx` |
| 7 | Places: campus address + `lat/lng` on the campus form (typed or one geocode); the three-way venue choice on create; `public_*` derivation; btree index | M | `campus-form.tsx`, `lib/events/actions.ts` |
| 8 | Map view: MapLibre + keyless tiles on `/` and `/c/[slug]`; anonymous `/` becomes the map; church pins on zoom-out; `MapPin` projection; clustering; mini-map on detail | M | `hub-filters.tsx` placeholder, `ViewerEvent` |
| 9 | Lifecycle: `updateEvent` + edit page; `/hub/review` (Restore / Cancel / Block host); *repeats weekly for N weeks* materializer; `/hub/e/` proxy prefix; reveal on "going" only; reporter-standing rule; server-side home-address acknowledgement; honest copy | L | `resolveEventReport`, `setEventPinned`, `createEvent` |
| 10 | Connection primitives: host display name (first + initial via a SECURITY DEFINER helper), *who's going* for private audiences, *Message the host* relay, member-readable `/groups/[id]`, *bring a friend* (`guest_count` exists), *add to calendar* (.ics from `ViewerEvent`), first-host moment | M | 027 policies, outbox |
| 11 | Gathering notices: `event_cancelled_to_rsvps`, `event_reported_to_admin`; SMS where consent exists on the existing line, email otherwise | S | `resolveProfileDelivery`, outbox |
| 12 | `/privacy` and `/terms`: one paragraph each per §7.9 | S | `app/privacy`, `app/terms` |

### Slice 2 — The admin's Monday (about 3 weeks)

*Done when:* Encounter's admin has received two Monday digests that name real people; a
booking and a meeting count as contact without anyone typing; "plugged in" is true for
someone added to a group; the Journey nav disappears for a church with no flow; `/learn`
shows the three seeded lessons and the host orientation unlocks hosting.

| | Item | Size | Builds on |
|---|---|---|---|
| 13 | `participant_touches` + trigger + system touches + *Log a contact* on two pages | M | 006 trigger pattern, 016 RLS shape, outbox, `meeting_started_at` |
| 14 | `ec_participant_stage()` over phase-1 facts; 7/30 constants; `connected` written on meeting completion | M | `participant_progress`, `group_members`, `event_rsvps` |
| 15 | *This week* console (four panes) rendering the orphaned `Pills` / `NeedsAttentionPanel`; `/participants?stage=`; connector *My week* strip | M | `lib/dashboard/queries.ts`, `components/dashboard/sections.tsx` |
| 16 | Monday digest cron with an empty-state version; toggle on `/settings/notifications` | S | `notifications-availability-reminders` cron pattern |
| 17 | Journey optional: `journey_mode`, nav collapse both sides, *Simple next steps* template; Hub link in every nav bracket | S | `lib/auth/nav.ts`, `lib/flows/seed-actions.ts`, `lib/flows/health.ts` |
| 18 | `/learn` + group targeting + three seeded lessons; orientation as the hosting gate | M | `lessons`, `flow_step_lessons`, groups |

### Slice 3 — Church #2 readiness (about 3 weeks; starts when a church signs)

*Done when:* a church is created from `/platform/churches`, its first admin invited by email
under the church's own name, its members imported without appearing as new, its campus
pinned, a gathering published and RSVP'd, the digest received, the agreement signed, and
the full matrix green in CI.

| | Item | Size |
|---|---|---|
| 19 | Platform-name decision applied: `{{church_name}}`, church-signed fallbacks, branded invite template, generic event-type seeds | S |
| 20 | Invites by email (first admin, staff, members); member join path; CSV import of members and guests; groups CSV import | M |
| 21 | `/account` (name, phone, email, password, consent; delete with §7.9 semantics) | M |
| 22 | `church_settings` (only: `allow_public_home_events`, host rule, first-public-gathering approval, `journey_mode`, digest day); `listed_on_map` + `verified_at`; `/settings/church`; Verify/List controls | M |
| 23 | `/c/[slug]` polish: service times, metadata, noindex on home and cancelled pages, sitemap excluding them; verified-only hint resolution | S |
| 24 | Church agreement one-pager; *Export our church*; "how texting works for our people" explainer | S |
| 25 | Getting Started checklist; test-data harness seeds groups/gatherings/touches and a second tenant; onboarding runbook with a "Sunday morning" section | M |
| 26 | Full visibility matrix in GitHub Actions with a Supabase container; adopt `supabase db push` (needs the one-time migration repair) | L |

### Phase 2 — Usher into service, and the first ring of the body (about 8–10 weeks)

*Done when:* at Encounter a newcomer goes from signup to an accepted next step and a serve
placement without leaving the app and *This week* shows it; an "Attend a gathering" step
completes from a host check-in; church #2's public gathering appears in Encounter members'
Nearby scope with church and distance and homes excluded; publish fan-out runs under the
per-host cap with consent enforced.

- `participant_next_steps` (kind group | serve_team | event | meeting; status offered |
  accepted | declined | done; "can't fully help" is a status, never a close) with the
  hand-off panel in the connector meeting room, *Suggested next steps* in the prep doc,
  *Your next steps* replacing the finished-journey celebration, and the 60/90 thresholds. (L)
- Serve pathway: serve teams folded into groups of kind `serve`; `group_gift_categories`
  so a top-3 gifts result suggests teams; `requires_clearance` gating placement into kids'
  teams; `/serve` console. (L)
- Journey meets gatherings: `flow_steps.event_type_id`, `attendance_mode`; step runner lists
  the next three gatherings; host check-in completes the step; *Invite to a gathering* from
  the connector workspace. (M)
- Full gathering notifications: publish fan-out via `resolveEventAudience` under the daily
  cap, reminders cron, `event_rsvp_to_host`, SMS line of record, STOP/START webhook,
  reporter abuse-history guard. (L)
- Nearby: `ec_nearby_public_events` and `ec_map_churches` SQL functions, `lib/commons`
  wrappers, the scope chip, "connected at <church>" roster label, `allow_visitor_rsvp`,
  matrix rows asserting private / home / unlisted / unverified rows never appear. (L)
- Residence RSVP host approval (reuse `waitlist`); group join requests; stage-conversion
  reporting; an EC-styled `/journey/book` so participants never see the raw scheduling UI;
  the Encounter pack as an explicit opt-in with markdown rendering at the fourteen
  `whitespace-pre-wrap` sites. (M each)

### Phase 3 — One person, many churches; the Body on one map (about 8 weeks)

*Done when:* a real person holds a connector role at one church and a member role at
another with no data copied and the extended matrix green; anonymous `/` renders listed
churches at every zoom; a second church has adopted a pack from the first; a church
application reaches the verification queue without creating a tenant.

- `church_memberships` with the §2 migration path; church switcher on `/account`; a
  *moved* flow; *Bring my story*. (L)
- The Body map: aggregates beyond state zoom, church cards with 30-day counts, "I'm
  visiting / I'm moving here" intents. (M)
- Pack sharing as versioned, deep-copied JSON; co-hosted public gatherings
  (`event_cohost_churches`, one EXISTS arm); *bring your church* applications and the
  platform trust console; the legal and data-rights pack (controller/processor language,
  export, retention, country gate); ICS feeds; PostGIS only if a radius query is measurably
  slow. (M each)

---

## 11. Keep, cut, rejected

**Keep as is.** `ec_can_see_event()` as the single visibility rule (SELECT policy, RSVP
check, report gate) with `resolveEventAudience` as its notify-side twin; `revealAddress` and
`ViewerEvent` as the only shapes the UI consumes (now backed by the `event_addresses`
policy); groups + the `parent_group_id` eligibility ring as the only audience primitive;
the connector engine end to end (availability, teams, auto-match against real slots, prep
doc, meeting room, confirm/decline); the flow builder with phases and parallel steps; the
three weighted assessments; the notification outbox with idempotency keys, per-church
templates, consent at enqueue, cron drains; the `require*` gates, `church_id NOT NULL`,
`recordAudit`, `ServiceResult<T>`, URL-as-state; SchedulingCore untouched in code and
projected read-only into feeds; the branded `/c/[slug]` pages; trust-then-verify; event
types seeded per church; the generalized month calendar; platform-admin-only church
creation; the test tenant as staging.

**Cut or deferred, with reasons.**

| Item | Why |
|---|---|
| Event creation by SMS with AI parsing | A new signature-validated inbound surface plus conversation state for a convenience the mobile form covers; does not move a newcomer toward a table. Only the STOP/START webhook ships. |
| Chat-first front door; care requests and the care log; the full profile vault | Deferred until at least three churches have curated content; their seeds are built in (§9). No health, prayer or age fields are added to gatherings meanwhile. |
| Networks, stewards, network pages, network sends | Geography is the network for the first ten churches; co-host rows and pack sharing are the only church-to-church objects. |
| A third visibility tier as an enum value | Cut permanently: doubles the matrix, can never be removed, reopens silent widening. |
| Sunday services and serve shifts as gatherings; the hub as calendar of record | Collides with Planning Center Calendar and Services; double entry is how a second tool dies by month six. |
| Full RFC 5545 recurrence | The N-row weekly materializer sharing `series_id` covers home groups with zero expansion logic. |
| `church_memberships` before a real two-church person exists | Phase 3, with the path written down; public cross-church reads and RSVPs need no identity change. |
| PostGIS in the first geo migration | A one-line swap later behind the same function signature. |
| Self-serve church creation, the governance pack (DPA page, retention crons, country allowlist, trust console) | Phase 3; an unverified tenant on a shared map is a spoofing surface. |
| Per-church subdomains | `/c/[slug]` is QR-able and indexable with no DNS work; the slug stays a path key. |
| The raw `/scheduling` UI for anyone but the platform admin; anonymous `/api/scheduling/*` | Cut from every church path in slice 0. |
| `serve_teams` as a separate object | Folded into groups of kind `serve`; rows stay for history. |
| Dead code: `/landing`, `/api/connectors`, the on-screen test password, the stale appointment-types footer, copy promising sends nothing performs | Deleted or corrected in slice 0 and slice 1. |
| New assessment kinds, question types, result pages | Frozen; Encounter-specific content. |
| A hosted staging project; a native mobile app; new work on `/journey/map` (the non-geographic progress map) | Per the 2026-07-31 decision; every surface is server-rendered and mobile-first; the QR is the install. |
| Storing member home coordinates, dates of birth, demographics, "people near me" | Cut permanently; a stored location is a liability with no product need. |

**Rejected from the six approaches, with reasons.** `church_memberships` and networks in
phase 1 (global skeleton before the local heart); PostGIS from day one; address-gating
every home gathering even when public and removing the host's confirmation (overrides a
locked decision; the same safety comes from the venue default, the server-side
acknowledgement and the church switch); the governance apparatus before church #2 (turns
the admin into a moderator before a shepherd); CRM vocabulary on the home screen; applying
the Encounter pack automatically on church creation (seeds one church's theology into a
tenant that did not ask); serve shifts and services as capacity-scheduled gatherings;
leaving the scheduling read policies open behind an app-level gate; deferring the groups UI
(without rosters "do life together" is a public events list); white-label renaming and
pricing plumbing before church #2 exists; a 500 m jitter for home pins; open self-join
groups in phase 1; the anonymous church chooser as the front door.

---

## 12. Decisions needed from the founder, and pre-flight checks

**Pre-flight (before slice 0 starts).** Enable Docker Desktop's WSL integration (the CLI is
installed; Docker is not reachable from this distro). In the Supabase dashboard, confirm:
the prod migration level (025 expected; if any of 026–028 was applied by hand, the in-place
revision becomes a new diff migration instead), whether the "Default Church" seed row is
still active, and whether *Confirm email* is on. Note the 2026-10-30 date for the GRANT
migration.

**Questions.** Each is phrased so a short answer unblocks work.

1. **Scheduling policies.** May I run a policy-only migration against `scheduling_locations`,
   `scheduling_resources` and `scheduling_appointment_types`, dropping the any-authenticated
   reads from 002/007 and recreating them church-scoped, with no code under
   `/lib/scheduling` or `/app/scheduling` touched? This is the one thing that must close
   before church #2 has data. - YES
2. **Platform name.** Keep "Encounter Connect" as the platform brand (as "Planning Center"
   is nobody's church), a neutral platform name with "<Church> Connect" at the public layer,
   or "Encounter Connect" as Encounter's instance of a neutrally named platform? Needed
   before church #2's first invite email, not before slice 0. - CALL THE PLATFORM "ChurchConnect"
   BUT GIVE EACH CHURCH IT'S OWN UNIQUE NAME "ENCOUNTER CONNECT through ChurchConnect".
3. **Home gatherings.** A church-level *allow public home-hosted gatherings* switch, with the
   host's knowing confirmation kept and enforced server-side. Proposed: **on for Encounter**
   (your locked decision), **off for new churches** until their admin flips it. - YES
4. **Hosting rule.** Proposed default: a member may host once their first meeting was
   completed at this church and they finished the five-minute host orientation; admins can
   mark anyone a trusted host; "first public gathering needs approval" exists but defaults
   off. Yes, or should new churches default to approval on? - YES
5. **SMS line of record.** One platform Twilio number and A2P campaign sending on behalf of
   every church, or a number and registration per church? Until answered, gathering
   broadcasts stay email-first and only cancel/report notices go by SMS on the existing line.
   I THINK WE NEED A SINGLE PLATFORM TWILIO NUMBER AND A2P CAMPAIGN, AS WELL AS AN OPTION FOR
   A CHURCH TO USE THEIR OWN NUMBER/REGISTRATION. HONESTLY NOT SURE HOW TO ANSWER THIS QUESTION.
6. **Churches #2 and #3.** Who are they: city, size, Planning Center or a spreadsheet, and
   what their onboarding looks like today? This decides when slice 3 starts, whether Nearby
   has anything to show at launch, and whether the two-step template is enough.
   CHURCH 2 - SEMINOLE TX, 300-600 PEOPLE ON AVERAGE SUNDAY, PLANNING CENTER, ONBOARDING LOOKS LIKE
   A 6-WEEK SUNDAY MORNING MEMBERSHIP CLASS.
   CHURCH 3 - LOOP TX, 10-20 PEOPLE AVERAGE, NO PLANNING CENTER, ONBOARDING LOOKS LIKE A HANDSHAKE
   AND A CONVERSATION.
7. **Encounter's assessments.** Inside a shareable pack, do you give away the three
   assessments' categories and questions to any church that opts in, or is the pack
   scaffolding plus starter lessons with the questions as Encounter's own content?
   I DON'T THINK THE ASSESSMENT CATEGORGIES OR QUESTIONS SHOULD STAY ONLY WITH ENCOUNTER.
   THE PART THAT NEEDS TO REMAIN BRANDED AS ENCOUNTER IS THE VIDEO JOURNEY.
8. **Cadence.** Are "contacted within 7 days, at a table by day 30" the right defaults (60/90
   come with next steps), and who gets the stuck nudge: the campus admin only, or the
   connector too? THE CAMPUS ADMIN SHOULD GET A NUDGE 2-3 DAYS AFTER THE CONNECTOR GETS NUGDED
   BUT HAS YET TO ACT.

---

## 13. Naming

"Encounter Connect" carries the founder's church's name. The day a second church prints a QR
code or reads a Monday digest it reads as another church's system. The public layer is
already white-labeled by logo and brand color on `/c/[slug]`; the admin shell, the auth
email template, about twenty notification fallbacks and the legal pages say "Encounter
Connect"; `package.json` still says `scheduling-core`. Slice 3 item 19 makes the name a
single config constant plus `{{church_name}}` everywhere a church's people see text. Decide
by church #2's first email (§12, Q2); it does not block slices 0–2.

---

## Appendix A — What the audit found that changes the plan

These were verified in code during the rethink and are the reason some items sit where they do.

- **Cross-tenant exposure in SchedulingCore today.** Any signed-in participant can read every
  church's connector names, emails, phones and free slots through PostgREST (002 lines
  72–124), any church admin can read and update every church's appointment types (007 lines
  29–36), `app/api/scheduling/*` is anonymous service-role outside the proxy matcher, and
  `app/scheduling/actions.ts` is ungated service-role. Harmless with one church; a blocker
  for two.
- **The dashboard's pipeline is empty by construction.** `participants.status` is never
  `in_progress` outside the test seed, so `getPills`, `getNeedsAttention` and
  `NeedsAttentionPanel` (zero callers) and the rendered in-progress table show nothing for
  real signups.
- **The hub is not running anywhere.** Migrations 026–028 have never executed; the hub's
  ~5,400 lines are uncommitted on `main`; there is no groups UI, review queue, edit page,
  pin UI, drafts, notifications, map or recurrence; `/hub/e/[id]` is not in the proxy's
  public allowlist so anonymous visitors are redirected off public event pages.
- **The address gate is TypeScript-only.** RLS returns the raw address and coordinate
  columns to every audience member; connectors bypass the gate entirely; "maybe" reveals a
  home address; `ViewerEvent` carries host email and phone to every signed-in viewer (today
  masked only by the profiles read policy); the home-address confirmation is a client-side
  checkbox; a cohost can flip a host's home gathering to public.
- **Every event is stored in Chicago time.** The create form never sends a timezone and both
  027 and `createEvent` default to `'America/Chicago'`.
- **Nothing writes coordinates.** `createEvent` never sets `lat/lng`; churches and campuses
  have none; no map library, geocoder or test runner is installed.
- **Local resets will expose nothing.** With `auto_expose_new_tables` unset, no table from
  001–028 is reachable on a fresh local database until a GRANT migration lands; the opt-out
  is removed 2026-10-30.
- **Hosting standing is global and granted at booking.** `ec_can_host_events` has no church
  filter and `connected` is written when a meeting is *booked*, not completed; "Block host"
  as planned would change nothing.
- **Reports can be griefed.** Any self-serve account (no captcha; confirmations unverified
  in prod) can hide every public gathering of every church with one click each.
- **Dead and orphaned code.** `/landing` is unreachable; `/api/connectors` has no caller;
  `resolveEventReport`, `setEventPinned` and `previewEventAudience` have no callers;
  `serve_teams` has no readers outside its own CRUD; the Hub nav link exists only in the
  admin and participant brackets; the test tenant's shared password is printed on screen.
- **Two identity tables.** The auth trigger from 003 creates `user_profiles` but not EC
  `profiles`; EC never reads `user_profiles.role`. Users created in the dashboard have no EC
  profile until something upserts one.
