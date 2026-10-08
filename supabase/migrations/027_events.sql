-- ============================================================
-- 027_events.sql
-- The connection hub's event domain.
--
-- Why this is NOT scheduling_bookings: bookings model a 1:1
-- appointment against a resource's generated availability (slot
-- engine, appointment type, confirm/decline). Events are the other
-- shape — host-declared time, many attendees, RSVP instead of
-- confirmation, audience scoping instead of a resource. Forcing
-- events through bookings would drag the slot engine into a domain
-- that needs none of it, and /lib/scheduling is off-limits.
--
-- Visibility is BINARY (decided 2026-08-17):
--   public  → visible to anyone, no login, full detail incl. address.
--   private → visible only to authenticated members of the targeted
--             audience, plus host/cohost and connectors/admins.
--
-- ONE visibility rule, ec_can_see_event(), is used by BOTH the read
-- path (as the events RLS SELECT policy) and the report gate. Two
-- implementations of this rule is exactly how the men end up seeing
-- girls night, so there is only ever one.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE ec_event_status AS ENUM (
  'draft',      -- host is still writing it; host + cohost + staff only
  'published',  -- live
  'cancelled',  -- still visible to its audience, with a banner
  'hidden'      -- pulled by a report; staff only, pending review
);

CREATE TYPE ec_event_visibility AS ENUM ('public', 'private');

CREATE TYPE ec_event_channel AS ENUM ('web', 'sms', 'admin');

-- WHO GETS NOTIFIED. Orthogonal to visibility (which is WHO CAN SEE).
CREATE TYPE ec_invite_ring AS ENUM (
  'members_only',           -- just the targeted groups
  'members_plus_eligible',  -- + the targeted groups' parent/eligibility rings
  'church_wide'
);

CREATE TYPE ec_rsvp_status AS ENUM ('going', 'maybe', 'not_going', 'waitlist');

CREATE TYPE ec_report_reason AS ENUM (
  'not_legitimate',
  'inappropriate',
  'wrong_details',
  'safety_concern',
  'spam',
  'other'
);

CREATE TYPE ec_report_resolution AS ENUM (
  'restored',
  'cancelled',
  'host_blocked',
  'no_action'
);

-- ── Event types ──────────────────────────────────────────────
-- Church-configurable, exactly like scheduling_appointment_types.

CREATE TABLE event_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  description         TEXT,
  color               TEXT,
  icon                TEXT,

  default_visibility  ec_event_visibility NOT NULL DEFAULT 'private',
  -- Marks the type as normally hosted in someone's home. Drives the
  -- default visibility above and the "you are about to publish a home
  -- address to the open internet" confirmation in the create form.
  default_is_private_residence BOOLEAN NOT NULL DEFAULT FALSE,

  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, slug)
);

CREATE TRIGGER event_types_updated_at
  BEFORE UPDATE ON event_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_event_types_church ON event_types(church_id);

-- Seed the four types the church asked for, for every existing church.
-- Home groups default to private + private-residence; the gathered-at-church
-- types default to public.
INSERT INTO event_types
  (church_id, name, slug, default_visibility, default_is_private_residence, order_index, color)
SELECT c.id, t.name, t.slug, t.vis, t.residence, t.ord, t.color
FROM churches c
CROSS JOIN (VALUES
  ('Home Group',     'home-group',     'private'::ec_event_visibility, TRUE,  0, '#0f766e'),
  ('Creation Night', 'creation-night', 'public'::ec_event_visibility,  FALSE, 1, '#d97706'),
  ('Prayer Set',     'prayer-set',     'public'::ec_event_visibility,  FALSE, 2, '#7c3aed'),
  ('Get-together',   'get-together',   'private'::ec_event_visibility, FALSE, 3, '#0284c7')
) AS t(name, slug, vis, residence, ord, color)
ON CONFLICT (church_id, slug) DO NOTHING;

-- ── Events ───────────────────────────────────────────────────

CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  campus_id         UUID REFERENCES campuses(id) ON DELETE SET NULL,
  event_type_id     UUID NOT NULL REFERENCES event_types(id),

  title             TEXT NOT NULL,
  description       TEXT,

  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  timezone          TEXT NOT NULL DEFAULT 'America/Chicago',
  all_day           BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule   TEXT,                    -- RFC 5545 subset; phase 4

  -- WHO CAN SEE. Private events draw their audience from event_audiences
  -- (groups) ∪ event_invites (named individuals), or the whole church when
  -- audience_is_church_wide.
  visibility        ec_event_visibility NOT NULL DEFAULT 'private',
  -- Explicit flag, NOT an empty-audience fallback. If "private with no groups
  -- picked" silently meant "everyone at the church", forgetting to pick a
  -- group would fan a private event out to the whole congregation — the exact
  -- failure this model exists to prevent.
  audience_is_church_wide BOOLEAN NOT NULL DEFAULT FALSE,

  -- WHO GETS NOTIFIED. Separate question from visibility.
  invite_ring       ec_invite_ring NOT NULL DEFAULT 'members_only',

  status            ec_event_status NOT NULL DEFAULT 'draft',

  host_profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cohost_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  location_name     TEXT,
  address_line1     TEXT,
  address_line2     TEXT,
  city              TEXT,
  region            TEXT,
  postal_code       TEXT,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  -- Hosted at a private residence. Never auto-derived — the host says so
  -- (defaulted from the event type) because only they know.
  is_private_residence     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Only meaningful for PRIVATE events. On a public event the address is
  -- public by definition, which is what 'public' means.
  hide_address_until_rsvp  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Seams back to scheduling: an optional church room, and a reserved slot
  -- for "this event also holds a room booking" so we never migrate for it.
  scheduling_location_id UUID REFERENCES scheduling_locations(id) ON DELETE SET NULL,
  scheduling_booking_id  UUID REFERENCES scheduling_bookings(id) ON DELETE SET NULL,

  capacity          INTEGER,
  rsvp_required     BOOLEAN NOT NULL DEFAULT FALSE,
  rsvp_deadline     TIMESTAMPTZ,
  image_url         TEXT,

  -- Pinning is an admin act and does not change visibility: a pinned
  -- private event is still private.
  pinned_at            TIMESTAMPTZ,
  pinned_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  published_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  cancelled_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  hidden_at            TIMESTAMPTZ,
  hidden_reason        TEXT,

  created_by_channel   ec_event_channel NOT NULL DEFAULT 'web',
  inbound_message_id   UUID,          -- FK added in phase 3 (029)

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_event_range CHECK (ends_at > starts_at),
  CONSTRAINT chk_event_capacity CHECK (capacity IS NULL OR capacity > 0)
);

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The hub's core query is "this church's events in this time window".
CREATE INDEX idx_events_church_starts ON events(church_id, starts_at);
CREATE INDEX idx_events_published_starts
  ON events(starts_at) WHERE status = 'published';
-- The anonymous public browser's query.
CREATE INDEX idx_events_public_starts
  ON events(church_id, starts_at)
  WHERE status = 'published' AND visibility = 'public';
CREATE INDEX idx_events_host ON events(host_profile_id);
CREATE INDEX idx_events_type ON events(event_type_id);
CREATE INDEX idx_events_pinned ON events(pinned_at) WHERE pinned_at IS NOT NULL;

COMMENT ON COLUMN events.audience_is_church_wide IS
  'Explicit "everyone at my church" audience for a private event. Never '
  'inferred from an empty event_audiences list.';

-- ── Audience: targeted groups ────────────────────────────────

CREATE TABLE event_audiences (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- TRUE when this row was added automatically because the event opted into
  -- invite_ring='members_plus_eligible' and this is the parent/eligibility
  -- ring of a targeted group. Notifying a ring that can't open the link is a
  -- 403 in someone's text message, so the ring is granted read access here
  -- rather than left as a rule someone has to remember.
  is_eligibility_ring BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, group_id)
);

CREATE INDEX idx_event_audiences_event ON event_audiences(event_id);
CREATE INDEX idx_event_audiences_group ON event_audiences(group_id);

-- ── Audience: named individuals ──────────────────────────────

CREATE TABLE event_invites (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, profile_id)
);

CREATE INDEX idx_event_invites_event   ON event_invites(event_id);
CREATE INDEX idx_event_invites_profile ON event_invites(profile_id);

-- ── RSVPs ────────────────────────────────────────────────────

CREATE TABLE event_rsvps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       ec_rsvp_status NOT NULL DEFAULT 'going',
  guest_count  INTEGER NOT NULL DEFAULT 0,
  note         TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, profile_id),
  CONSTRAINT chk_rsvp_guests CHECK (guest_count >= 0)
);

CREATE TRIGGER event_rsvps_updated_at
  BEFORE UPDATE ON event_rsvps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_event_rsvps_event   ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_profile ON event_rsvps(profile_id);

-- ── Reports ──────────────────────────────────────────────────
-- Trust-then-verify: the first report hides the event and texts an admin.
-- Reporting is gated by ec_can_see_event(), which is what keeps it safe —
-- a private event can only be reported by its targeted audience (curated,
-- named, auditable people), and anonymous visitors can browse public events
-- but never report, because unaccountable reporting is pure griefing surface.

CREATE TABLE event_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id               UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason                 ec_report_reason NOT NULL DEFAULT 'other',
  note                   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at            TIMESTAMPTZ,
  resolved_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolution             ec_report_resolution,
  -- One report per person per event. Every report is attributable, which is
  -- what makes the phase-2 reporter abuse-history check possible.
  UNIQUE (event_id, reporter_profile_id)
);

CREATE INDEX idx_event_reports_event    ON event_reports(event_id);
CREATE INDEX idx_event_reports_reporter ON event_reports(reporter_profile_id);
CREATE INDEX idx_event_reports_open
  ON event_reports(created_at) WHERE resolved_at IS NULL;

-- ── Notification batches ─────────────────────────────────────
-- One row per fan-out, so an admin can see who a host reached and when,
-- and so the per-host daily recipient cap has something to count.

CREATE TABLE event_notification_batches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requested_by_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ring                     ec_invite_ring NOT NULL,
  audience_summary         JSONB NOT NULL DEFAULT '{}',
  recipient_count          INTEGER NOT NULL DEFAULT 0,
  sms_count                INTEGER NOT NULL DEFAULT 0,
  email_count              INTEGER NOT NULL DEFAULT 0,
  skipped_count            INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at                  TIMESTAMPTZ
);

CREATE INDEX idx_event_batches_event ON event_notification_batches(event_id);
CREATE INDEX idx_event_batches_requester
  ON event_notification_batches(requested_by_profile_id, created_at);

-- ============================================================
-- THE visibility rule. Single source of truth.
--
-- SECURITY DEFINER matters twice:
--   1. The function reads `events` and is then used as the `events` SELECT
--      policy. As DEFINER it runs as the table owner, which bypasses RLS,
--      so there is no policy recursion.
--   2. It consults group membership and invite rows the caller may not be
--      able to read directly.
-- ============================================================

CREATE OR REPLACE FUNCTION ec_can_see_event(e_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  e         events;
  uid       UUID := auth.uid();
  is_staff  BOOLEAN;
BEGIN
  SELECT * INTO e FROM events WHERE id = e_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Public is visible to everyone, including anonymous visitors. Checked
  -- BEFORE any auth.uid() logic precisely so the public hub works with no
  -- session at all.
  --
  -- 'cancelled' is included deliberately: an anonymous visitor who saw the
  -- event yesterday is exactly who needs to find out it's off. Drafts and
  -- reported/hidden events are never public.
  IF e.visibility = 'public' AND e.status IN ('published', 'cancelled') THEN
    RETURN TRUE;
  END IF;

  -- Everything below requires a session.
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Staff override: "the men should never see that event unless they are a
  -- connector/admin". ec_has_role('connector') covers connector,
  -- campus_admin and church_admin; platform admins short-circuit inside it.
  is_staff := ec_is_platform_admin()
    OR (e.church_id = ec_current_church_id() AND ec_has_role('connector'));

  IF is_staff THEN
    RETURN TRUE;
  END IF;

  -- The host and cohost always see their own event, in any status.
  IF uid = e.host_profile_id OR uid = e.cohost_profile_id THEN
    RETURN TRUE;
  END IF;

  -- Status gates for non-staff, non-host viewers.
  --   draft  → nobody else, it isn't real yet
  --   hidden → nobody else, it's pulled pending review
  --   published / cancelled → fall through to the audience check. Cancelled
  --     stays visible to its audience so nobody shows up to a cancelled
  --     home group; the UI renders the banner.
  IF e.status IN ('draft', 'hidden') THEN
    RETURN FALSE;
  END IF;

  -- Only private events remain: every public event returned TRUE above.
  IF e.church_id IS DISTINCT FROM ec_current_church_id() THEN
    RETURN FALSE;
  END IF;

  IF e.audience_is_church_wide THEN
    RETURN TRUE;
  END IF;

  -- Member of any targeted group (including an auto-added eligibility ring).
  IF EXISTS (
    SELECT 1
    FROM event_audiences ea
    JOIN group_members gm ON gm.group_id = ea.group_id
    WHERE ea.event_id = e.id AND gm.profile_id = uid
  ) THEN
    RETURN TRUE;
  END IF;

  -- Individually invited.
  IF EXISTS (
    SELECT 1 FROM event_invites
    WHERE event_id = e.id AND profile_id = uid
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION ec_can_see_event(UUID) IS
  'The single event visibility rule. Used as the events RLS SELECT policy '
  'and as the gate on who may report an event. Do not reimplement this '
  'logic anywhere — resolveEventAudience() in lib/events/audience.ts is '
  'the notify-side twin and must be kept in agreement with it.';

-- Can the current user host events? Anyone who has been through the connect
-- platform, plus staff. Used by the create-event action and the hub UI.
CREATE OR REPLACE FUNCTION ec_can_host_events()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ec_is_platform_admin()
    OR ec_has_role('connector')
    OR EXISTS (
      SELECT 1 FROM participants p
      WHERE p.profile_id = auth.uid()
        AND p.status IN ('connected', 'completed')
    );
$$;

-- ── RLS: events ──────────────────────────────────────────────
-- The SELECT policy IS the visibility rule, so hub queries carry no
-- visibility WHERE clause at all and forgetting one is impossible.
-- Note `TO anon, authenticated`: the public hub reads with no session.

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_read"
  ON events FOR SELECT TO anon, authenticated
  USING (ec_can_see_event(id));

-- Hosts create their own events; staff create any. WITH CHECK pins
-- host_profile_id to the caller so a member can't create an event in
-- someone else's name.
CREATE POLICY "events_insert_host"
  ON events FOR INSERT TO authenticated
  WITH CHECK (
    church_id = ec_current_church_id()
    AND (
      (host_profile_id = auth.uid() AND ec_can_host_events())
      OR ec_has_role('campus_admin')
    )
  );

CREATE POLICY "events_update_host_or_admin"
  ON events FOR UPDATE TO authenticated
  USING (
    ec_is_platform_admin()
    OR host_profile_id = auth.uid()
    OR cohost_profile_id = auth.uid()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR host_profile_id = auth.uid()
    OR cohost_profile_id = auth.uid()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- Deletes are admin-only; hosts cancel instead, so RSVPs keep their record.
CREATE POLICY "events_delete_admin"
  ON events FOR DELETE TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── RLS: event_types ─────────────────────────────────────────

ALTER TABLE event_types ENABLE ROW LEVEL SECURITY;

-- Authenticated reads are church-scoped. The public hub renders type filters
-- through `listEventTypes`, which uses the service-role client with an explicit
-- church_id, so anon needs no policy here — and giving it one would leak every
-- tenant's custom type names to the internet.
CREATE POLICY "event_types_read"
  ON event_types FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "event_types_write_admin"
  ON event_types FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── RLS: event_audiences / event_invites ─────────────────────
-- Readable when you can see the event. Writable by host/cohost/admin.
-- NOTE: event_audiences deliberately does NOT expose group membership —
-- only which groups are targeted.

ALTER TABLE event_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_audiences_read"
  ON event_audiences FOR SELECT TO authenticated
  USING (ec_can_see_event(event_id));

CREATE POLICY "event_audiences_write"
  ON event_audiences FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_audiences.event_id
        AND (
          ec_is_platform_admin()
          OR e.host_profile_id = auth.uid()
          OR e.cohost_profile_id = auth.uid()
          OR (e.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_audiences.event_id
        AND (
          ec_is_platform_admin()
          OR e.host_profile_id = auth.uid()
          OR e.cohost_profile_id = auth.uid()
          OR (e.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  );

ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_invites_read"
  ON event_invites FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR ec_can_see_event(event_id));

CREATE POLICY "event_invites_write"
  ON event_invites FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_invites.event_id
        AND (
          ec_is_platform_admin()
          OR e.host_profile_id = auth.uid()
          OR e.cohost_profile_id = auth.uid()
          OR (e.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_invites.event_id
        AND (
          ec_is_platform_admin()
          OR e.host_profile_id = auth.uid()
          OR e.cohost_profile_id = auth.uid()
          OR (e.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  );

-- ── RLS: event_rsvps ─────────────────────────────────────────
-- The roster is NOT public. Anonymous visitors get a count from a
-- service-role query, never rows. Members see their own RSVP; the host,
-- cohost and staff see the full roster.

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_rsvps_read"
  ON event_rsvps FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_rsvps.event_id
        AND (
          ec_is_platform_admin()
          OR e.host_profile_id = auth.uid()
          OR e.cohost_profile_id = auth.uid()
          OR (e.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

-- You may only RSVP for yourself, and only to an event you can see.
CREATE POLICY "event_rsvps_write_own"
  ON event_rsvps FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid() AND ec_can_see_event(event_id));

-- ── RLS: event_reports ───────────────────────────────────────
-- Insert is gated by ec_can_see_event: you can only report what you can
-- see. Reads are staff-only — a host must not be able to see who reported
-- them, and reporters must not be able to check on each other.

ALTER TABLE event_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_reports_read_staff"
  ON event_reports FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR reporter_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_reports.event_id
        AND e.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );

CREATE POLICY "event_reports_insert_viewer"
  ON event_reports FOR INSERT TO authenticated
  WITH CHECK (
    reporter_profile_id = auth.uid()
    AND ec_can_see_event(event_id)
  );

CREATE POLICY "event_reports_update_admin"
  ON event_reports FOR UPDATE TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_reports.event_id
        AND e.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );

-- ── RLS: event_notification_batches ──────────────────────────

ALTER TABLE event_notification_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_batches_read_staff_or_host"
  ON event_notification_batches FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR requested_by_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_notification_batches.event_id
        AND e.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
