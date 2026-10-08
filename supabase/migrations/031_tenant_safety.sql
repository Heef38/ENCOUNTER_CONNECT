-- ============================================================
-- 031_tenant_safety.sql
--
-- Closes the cross-church doors in SchedulingCore's read policies before
-- a second church has data (approved 2026-10-08, rethink §12 Q1), and
-- adds host standing.
--
-- Policy and trigger changes only. No code under /lib/scheduling or
-- /app/scheduling changes, and no scheduling table gains a column.
--
-- SchedulingCore tables carry no church_id except appointment types
-- (020). Church ownership is derived from the EC links that already
-- exist:
--   scheduling_resources -> connectors / connector_teams.scheduling_resource_id
--   scheduling_locations -> campuses.scheduling_location_id
--
-- Before this migration any signed-in user could read every church's
-- connector names, emails, phones and free slots (002 / 003), any church
-- admin could read and update every church's appointment types (007),
-- and anyone could insert or move a booking onto another church's
-- connector calendar (002).
-- ============================================================

-- ── Ownership helpers (SECURITY DEFINER: they must see across churches
--    to answer "is this mine" and "is this anyone's") ────────────────

CREATE OR REPLACE FUNCTION ec_resource_in_my_church(rid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ec_current_church_id() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM connectors c
            WHERE c.scheduling_resource_id = rid AND c.church_id = ec_current_church_id())
    OR EXISTS (SELECT 1 FROM connector_teams t
               WHERE t.scheduling_resource_id = rid AND t.church_id = ec_current_church_id())
  );
$$;

CREATE OR REPLACE FUNCTION ec_resource_is_unclaimed(rid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM connectors WHERE scheduling_resource_id = rid)
     AND NOT EXISTS (SELECT 1 FROM connector_teams WHERE scheduling_resource_id = rid);
$$;

CREATE OR REPLACE FUNCTION ec_location_in_my_church(lid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ec_current_church_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM campuses
    WHERE scheduling_location_id = lid AND church_id = ec_current_church_id()
  );
$$;

CREATE OR REPLACE FUNCTION ec_location_is_unclaimed(lid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM campuses WHERE scheduling_location_id = lid);
$$;

-- ── scheduling_locations ─────────────────────────────────────
-- Members see their own church's rooms. Campus admins also see rooms no
-- church has linked yet, so they can link one to a campus.

DROP POLICY IF EXISTS "anyone authenticated can view active locations" ON public.scheduling_locations;
CREATE POLICY "ec members can view their church's locations"
  ON public.scheduling_locations FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR ec_location_in_my_church(id)
    OR (ec_has_role('campus_admin') AND ec_location_is_unclaimed(id))
  );

-- ── scheduling_resources ─────────────────────────────────────
-- Connector calendars carry names, emails and phones. Staff see their own
-- church's; campus admins also see unlinked ones so they can link a
-- connector. A connector still sees their own row ("resource can view
-- their own record", 002).

DROP POLICY IF EXISTS "anyone authenticated can view active resources" ON public.scheduling_resources;
CREATE POLICY "ec staff can view their church's resources"
  ON public.scheduling_resources FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (ec_has_role('connector') AND ec_resource_in_my_church(id))
    OR (ec_has_role('campus_admin') AND ec_resource_is_unclaimed(id))
  );

-- ── scheduling_appointment_types ─────────────────────────────

DROP POLICY IF EXISTS "anyone can view active public appointment types" ON public.scheduling_appointment_types;
DROP POLICY IF EXISTS "ec admins can read all appointment types" ON public.scheduling_appointment_types;
DROP POLICY IF EXISTS "ec admins can update appointment types" ON public.scheduling_appointment_types;

CREATE POLICY "ec members can view their church's appointment types"
  ON public.scheduling_appointment_types FOR SELECT TO authenticated
  USING (ec_is_platform_admin() OR church_id = ec_current_church_id());

CREATE POLICY "ec church admins can update their church's appointment types"
  ON public.scheduling_appointment_types FOR UPDATE TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  );

-- ── scheduling_bookings: no booking onto another church's calendar ──
-- Every booking the app creates goes through the service role; these
-- policies only constrain direct API calls.

DROP POLICY IF EXISTS "authenticated users can create bookings" ON public.scheduling_bookings;
CREATE POLICY "members can book their own church's resources"
  ON public.scheduling_bookings FOR INSERT TO authenticated
  WITH CHECK (
    booked_by = auth.uid()
    AND resource_id IS NOT NULL
    AND ec_resource_in_my_church(resource_id)
  );

DROP POLICY IF EXISTS "participant can update own bookings" ON public.scheduling_bookings;
CREATE POLICY "participant can update own bookings"
  ON public.scheduling_bookings FOR UPDATE TO authenticated
  USING (booked_by = auth.uid())
  WITH CHECK (
    booked_by = auth.uid()
    AND (resource_id IS NULL OR ec_resource_in_my_church(resource_id))
  );

-- ── EC links into scheduling can't claim another church's calendar ──

CREATE OR REPLACE FUNCTION ec_guard_scheduling_links()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF ec_is_server_role() OR ec_is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'campuses' THEN
    IF NEW.scheduling_location_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.scheduling_location_id IS DISTINCT FROM OLD.scheduling_location_id)
       AND NOT (ec_location_in_my_church(NEW.scheduling_location_id)
                OR ec_location_is_unclaimed(NEW.scheduling_location_id)) THEN
      RAISE EXCEPTION 'That room belongs to another church.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.scheduling_resource_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.scheduling_resource_id IS DISTINCT FROM OLD.scheduling_resource_id)
       AND NOT (ec_resource_in_my_church(NEW.scheduling_resource_id)
                OR ec_resource_is_unclaimed(NEW.scheduling_resource_id)) THEN
      RAISE EXCEPTION 'That calendar belongs to another church.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campuses_guard_scheduling_links ON campuses;
CREATE TRIGGER campuses_guard_scheduling_links
  BEFORE INSERT OR UPDATE OF scheduling_location_id ON campuses
  FOR EACH ROW EXECUTE FUNCTION ec_guard_scheduling_links();

DROP TRIGGER IF EXISTS connectors_guard_scheduling_links ON connectors;
CREATE TRIGGER connectors_guard_scheduling_links
  BEFORE INSERT OR UPDATE OF scheduling_resource_id ON connectors
  FOR EACH ROW EXECUTE FUNCTION ec_guard_scheduling_links();

DROP TRIGGER IF EXISTS connector_teams_guard_scheduling_links ON connector_teams;
CREATE TRIGGER connector_teams_guard_scheduling_links
  BEFORE INSERT OR UPDATE OF scheduling_resource_id ON connector_teams
  FOR EACH ROW EXECUTE FUNCTION ec_guard_scheduling_links();

-- ── The migration-005 seed church never appears anywhere ──
-- Already inactive on the hosted project; a fresh database seeds it active,
-- which would defeat the single-church fallback for anonymous visitors.
UPDATE churches SET is_active = FALSE
WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── Host standing ────────────────────────────────────────────
-- An admin can mark someone a trusted host (hosting without the journey
-- gate, for churches whose onboarding is a handshake) or block a host.
-- "Block host" in /hub/review writes host_blocked_at, which
-- ec_can_host_events reads, so a block actually stops new gatherings.

ALTER TABLE profiles
  ADD COLUMN host_blocked_at   TIMESTAMPTZ,
  ADD COLUMN host_blocked_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN trusted_host_at   TIMESTAMPTZ,
  ADD COLUMN trusted_host_by   UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Extends the 029 guard: host standing is set by a campus admin or church
-- admin of the person's church, never by the person.
CREATE OR REPLACE FUNCTION ec_guard_profile_privileges()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF ec_is_server_role() OR ec_is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Profiles are created by the server (signup or invite), not by a session.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'A profile id cannot change.' USING ERRCODE = '42501';
  END IF;

  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    RAISE EXCEPTION 'Only a platform admin can change platform-admin status.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.church_id IS DISTINCT FROM OLD.church_id THEN
    RAISE EXCEPTION 'Only a platform admin can move a person to another church.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT COALESCE(
      ec_current_role() = 'church_admin'
      AND OLD.church_id IS NOT DISTINCT FROM ec_current_church_id()
      AND (NEW.id IS DISTINCT FROM auth.uid() OR NEW.role <> 'church_admin'),
      FALSE
    ) THEN
      RAISE EXCEPTION 'Only a church admin can change roles in their church.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.campus_id IS DISTINCT FROM OLD.campus_id
     AND NEW.campus_id IS NOT NULL
     AND ec_campus_church_id(NEW.campus_id) IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'That campus belongs to another church.' USING ERRCODE = '42501';
  END IF;

  IF (NEW.sms_consent_at IS DISTINCT FROM OLD.sms_consent_at
      OR NEW.sms_consent_source IS DISTINCT FROM OLD.sms_consent_source)
     AND NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the person can change their texting consent.'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.host_blocked_at IS DISTINCT FROM OLD.host_blocked_at
      OR NEW.host_blocked_by IS DISTINCT FROM OLD.host_blocked_by
      OR NEW.trusted_host_at IS DISTINCT FROM OLD.trusted_host_at
      OR NEW.trusted_host_by IS DISTINCT FROM OLD.trusted_host_by)
     AND NOT COALESCE(
       NEW.id IS DISTINCT FROM auth.uid()
       AND auth.uid() IS NOT NULL
       AND OLD.church_id IS NOT DISTINCT FROM ec_current_church_id()
       AND ec_has_role('campus_admin'),
       FALSE
     ) THEN
    RAISE EXCEPTION 'Host standing is set by an admin of your church.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ec_can_host_events()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.church_id IS NOT NULL
        AND p.host_blocked_at IS NULL
        AND (
          p.role <> 'participant'
          OR p.trusted_host_at IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM participants pa
            WHERE pa.profile_id = p.id
              AND pa.church_id = p.church_id
              AND pa.status IN ('connected', 'completed')
          )
        )
    );
$$;

-- ── API grants ───────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION
  ec_resource_in_my_church(UUID), ec_resource_is_unclaimed(UUID),
  ec_location_in_my_church(UUID), ec_location_is_unclaimed(UUID),
  ec_can_host_events()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
