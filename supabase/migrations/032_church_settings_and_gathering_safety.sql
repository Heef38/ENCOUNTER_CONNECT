-- ============================================================
-- 032_church_settings_and_gathering_safety.sql
--
-- 1. church_settings: the handful of per-church policy switches an admin
--    owns (rethink §7, answers to §12 Q3-Q5, Q8).
-- 2. churches.connect_name: each church's own name for its connect
--    ministry ("Encounter Connect"), shown as
--    "<connect_name> through ChurchConnect" (§12 Q2).
-- 3. New churches get settings and starter event types automatically.
-- 4. Guards on gatherings that RLS policies cannot express, because they
--    compare old and new values or look across tables:
--      * a host cannot un-hide a reported gathering, pin it, or move it
--        to another church; only staff restore or pin
--      * a cohost cannot change who sees it or where it is
--      * a public home gathering needs the church's switch
--      * a gathering for a youth group must be private, hold its address
--        until RSVP, and have a staff host
--      * audiences, invitees and cohosts stay inside the church
-- ============================================================

-- ── churches.connect_name ────────────────────────────────────

ALTER TABLE churches ADD COLUMN connect_name TEXT;

COMMENT ON COLUMN churches.connect_name IS
  'The church''s own name for its connect ministry, e.g. "Encounter Connect". '
  'Shown as "<connect_name> through ChurchConnect". Unique across the platform.';

CREATE UNIQUE INDEX idx_churches_connect_name
  ON churches (lower(connect_name)) WHERE connect_name IS NOT NULL;

UPDATE churches SET connect_name = 'Encounter Connect' WHERE slug = 'encounter';

-- ── Listing on the shared map ────────────────────────────────
-- A church appears to people outside it (as a pin on the map, and its
-- public gatherings in "Nearby") only when its admin has listed it AND the
-- platform has verified it. A church is never listed by default.
ALTER TABLE churches
  ADD COLUMN listed_on_map BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN verified_at   TIMESTAMPTZ,
  ADD COLUMN verified_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

UPDATE churches SET listed_on_map = TRUE, verified_at = NOW() WHERE slug = 'encounter';


-- ── church_settings ──────────────────────────────────────────

CREATE TABLE church_settings (
  church_id UUID PRIMARY KEY REFERENCES churches(id) ON DELETE CASCADE,

  -- Homes. A host may publish their home address publicly only when the
  -- church allows it, and only after the plain-language confirmation
  -- (events.public_home_acknowledged_at). Off for new churches.
  allow_public_home_events BOOLEAN NOT NULL DEFAULT FALSE,

  -- Hosting. Members host once their first meeting is complete and they
  -- have done the host orientation (migration 034); admins can mark anyone
  -- a trusted host. Public gatherings by members can be held for approval.
  require_host_orientation      BOOLEAN NOT NULL DEFAULT TRUE,
  require_public_event_approval BOOLEAN NOT NULL DEFAULT FALSE,

  -- Which on-ramp the church runs. NULL until chosen on Getting Started.
  --   encounter  Encounter's video journey (branded as Encounter's)
  --   simple     attend a gathering, then meet a connector
  --   custom     a flow the church built (e.g. a six-week class)
  --   none       a handshake and a conversation; no journey screens
  journey_mode TEXT CHECK (journey_mode IN ('encounter', 'simple', 'custom', 'none')),

  -- Cadence for "on track" (rethink §6): contacted within N days, at a
  -- table within M days. The connector is nudged first; the campus admin
  -- is nudged when the connector has not acted after admin_escalation_days.
  contact_within_days     INTEGER NOT NULL DEFAULT 7  CHECK (contact_within_days BETWEEN 1 AND 60),
  plugged_in_within_days  INTEGER NOT NULL DEFAULT 30 CHECK (plugged_in_within_days BETWEEN 7 AND 180),
  admin_escalation_days   INTEGER NOT NULL DEFAULT 3  CHECK (admin_escalation_days BETWEEN 1 AND 14),

  -- The Monday digest to admins.
  digest_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  digest_day_of_week  INTEGER NOT NULL DEFAULT 1 CHECK (digest_day_of_week BETWEEN 0 AND 6),

  -- Texting (§12 Q5). 'platform' sends from the ChurchConnect number and
  -- campaign. 'own' sends from a number registered to the church under
  -- its own A2P brand and campaign, provisioned in the platform's Twilio
  -- account. Identifiers only: no credentials are stored here.
  sms_sender_mode            TEXT NOT NULL DEFAULT 'platform'
    CHECK (sms_sender_mode IN ('platform', 'own')),
  sms_from_number            TEXT,
  sms_messaging_service_sid  TEXT,
  CONSTRAINT chk_own_sender_identified
    CHECK (sms_sender_mode = 'platform'
           OR sms_from_number IS NOT NULL
           OR sms_messaging_service_sid IS NOT NULL),

  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TRIGGER church_settings_updated_at
  BEFORE UPDATE ON church_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO church_settings (church_id)
SELECT id FROM churches
ON CONFLICT (church_id) DO NOTHING;

-- Encounter's founder-locked decision (2026-08-17): a host may knowingly
-- publish their home address. Encounter runs its own video journey.
UPDATE church_settings
SET allow_public_home_events = TRUE, journey_mode = 'encounter'
WHERE church_id IN (SELECT id FROM churches WHERE slug = 'encounter');

ALTER TABLE church_settings ENABLE ROW LEVEL SECURITY;

-- Everyone in the church can read the switches that shape their screens
-- (e.g. whether the create form may offer a public home gathering).
CREATE POLICY "church_settings_read_own_church"
  ON church_settings FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "church_settings_write_church_admin"
  ON church_settings FOR UPDATE TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  );

-- Settings for a church, defaults when no row exists.
CREATE OR REPLACE FUNCTION ec_church_settings(cid UUID)
RETURNS church_settings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s church_settings;
BEGIN
  SELECT * INTO s FROM church_settings WHERE church_id = cid;
  IF NOT FOUND THEN
    s.church_id := cid;
    s.allow_public_home_events := FALSE;
    s.require_host_orientation := TRUE;
    s.require_public_event_approval := FALSE;
  END IF;
  RETURN s;
END;
$$;

-- ── New churches start ready ─────────────────────────────────

CREATE OR REPLACE FUNCTION ec_on_church_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO church_settings (church_id) VALUES (NEW.id)
  ON CONFLICT (church_id) DO NOTHING;
  PERFORM ec_seed_event_types(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER churches_on_created
  AFTER INSERT ON churches
  FOR EACH ROW EXECUTE FUNCTION ec_on_church_created();

-- ── Gathering guard ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_is_church_staff(cid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ec_is_platform_admin()
    OR (cid = ec_current_church_id() AND ec_has_role('campus_admin'));
$$;

CREATE OR REPLACE FUNCTION ec_event_has_youth_audience(e_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_audiences ea
    JOIN groups g ON g.id = ea.group_id
    WHERE ea.event_id = e_id AND g.is_youth
  );
$$;

CREATE OR REPLACE FUNCTION ec_profile_is_staff_of(pid UUID, cid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = pid AND (is_platform_admin OR (church_id = cid AND role <> 'participant'))
  );
$$;

CREATE OR REPLACE FUNCTION ec_guard_event_changes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  server    BOOLEAN := ec_is_server_role();
  staff     BOOLEAN;
  settings  church_settings;
BEGIN
  settings := ec_church_settings(NEW.church_id);

  -- Rules that bind everyone, the server included.
  IF NEW.visibility = 'public' AND NEW.venue_kind = 'home'
     AND NOT settings.allow_public_home_events
     AND (TG_OP = 'INSERT' OR OLD.visibility <> 'public' OR OLD.venue_kind <> 'home') THEN
    RAISE EXCEPTION 'This church keeps home gatherings private.' USING ERRCODE = '42501';
  END IF;

  IF NEW.cohost_profile_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.cohost_profile_id IS DISTINCT FROM OLD.cohost_profile_id)
     AND ec_profile_church_id(NEW.cohost_profile_id) IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'A cohost must belong to the same church.' USING ERRCODE = '42501';
  END IF;

  -- (A NULL host means the host's account was deleted; the gathering is
  -- left as it was, and staff can cancel it.)
  IF TG_OP = 'UPDATE' AND ec_event_has_youth_audience(NEW.id)
     AND (NEW.visibility = 'public' OR NOT NEW.hide_address_until_rsvp
          OR (NEW.host_profile_id IS NOT NULL
              AND NEW.host_profile_id IS DISTINCT FROM OLD.host_profile_id
              AND NOT ec_profile_is_staff_of(NEW.host_profile_id, NEW.church_id))) THEN
    RAISE EXCEPTION 'A youth gathering stays private, holds its address until RSVP, and has a staff host.'
      USING ERRCODE = '42501';
  END IF;

  IF server THEN
    RETURN NEW;
  END IF;

  staff := ec_is_church_staff(NEW.church_id);

  IF TG_OP = 'INSERT' THEN
    IF NOT staff AND (NEW.pinned_at IS NOT NULL OR NEW.status = 'hidden') THEN
      RAISE EXCEPTION 'Only an admin can pin or hide a gathering.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.church_id IS DISTINCT FROM OLD.church_id THEN
    RAISE EXCEPTION 'A gathering cannot move to another church.' USING ERRCODE = '42501';
  END IF;

  IF staff THEN
    RETURN NEW;
  END IF;

  -- Host and cohost below this line.
  IF NEW.pinned_at IS DISTINCT FROM OLD.pinned_at
     OR NEW.pinned_by_profile_id IS DISTINCT FROM OLD.pinned_by_profile_id
     OR NEW.hidden_at IS DISTINCT FROM OLD.hidden_at
     OR NEW.hidden_reason IS DISTINCT FROM OLD.hidden_reason THEN
    RAISE EXCEPTION 'Only an admin can pin, hide or restore a gathering.' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft'     AND NEW.status IN ('published', 'cancelled'))
    OR (OLD.status = 'published' AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'That status change needs an admin.' USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'hidden' THEN
    RAISE EXCEPTION 'This gathering is under review by an admin.' USING ERRCODE = '42501';
  END IF;

  IF NEW.host_profile_id IS DISTINCT FROM OLD.host_profile_id THEN
    RAISE EXCEPTION 'Only an admin can change who hosts a gathering.' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.host_profile_id AND (
       NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.venue_kind IS DISTINCT FROM OLD.venue_kind
    OR NEW.hide_address_until_rsvp IS DISTINCT FROM OLD.hide_address_until_rsvp
    OR NEW.public_home_acknowledged_at IS DISTINCT FROM OLD.public_home_acknowledged_at
    OR NEW.audience_is_church_wide IS DISTINCT FROM OLD.audience_is_church_wide
    OR NEW.invite_ring IS DISTINCT FROM OLD.invite_ring
    OR NEW.cohost_profile_id IS DISTINCT FROM OLD.cohost_profile_id
  ) THEN
    RAISE EXCEPTION 'Only the host can change who sees a gathering or where it is.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER events_guard_changes
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION ec_guard_event_changes();

-- ── Audiences and invites stay inside the church ─────────────

CREATE OR REPLACE FUNCTION ec_guard_event_audience()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  e events;
BEGIN
  SELECT * INTO e FROM events WHERE id = NEW.event_id;

  IF TG_TABLE_NAME = 'event_audiences' THEN
    IF ec_group_church_id(NEW.group_id) IS DISTINCT FROM e.church_id THEN
      RAISE EXCEPTION 'That group belongs to another church.' USING ERRCODE = '42501';
    END IF;
    -- A member hosts for groups they are in; staff can target any group.
    -- (Eligibility-ring rows are written by the server.)
    IF NOT ec_is_server_role()
       AND NOT ec_is_church_staff(e.church_id)
       AND NOT ec_has_role('connector')
       AND NOT ec_is_group_member(NEW.group_id) THEN
      RAISE EXCEPTION 'You can only invite groups you belong to.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM groups WHERE id = NEW.group_id AND is_youth)
       AND (e.visibility = 'public' OR NOT e.hide_address_until_rsvp
            OR NOT ec_profile_is_staff_of(e.host_profile_id, e.church_id)) THEN
      RAISE EXCEPTION 'A youth gathering stays private, holds its address until RSVP, and has a staff host.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF ec_profile_church_id(NEW.profile_id) IS DISTINCT FROM e.church_id THEN
      RAISE EXCEPTION 'You can only invite people from your church.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_audiences_guard
  BEFORE INSERT OR UPDATE ON event_audiences
  FOR EACH ROW EXECUTE FUNCTION ec_guard_event_audience();

CREATE TRIGGER event_invites_guard
  BEFORE INSERT OR UPDATE ON event_invites
  FOR EACH ROW EXECUTE FUNCTION ec_guard_event_audience();

-- ── API grants ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON church_settings TO authenticated;
GRANT ALL ON church_settings TO service_role;
GRANT EXECUTE ON FUNCTION
  ec_church_settings(UUID), ec_is_church_staff(UUID),
  ec_event_has_youth_audience(UUID), ec_profile_is_staff_of(UUID, UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
