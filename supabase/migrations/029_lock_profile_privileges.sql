-- ============================================================
-- 029_lock_profile_privileges.sql
--
-- URGENT. Independent of 026-028: safe to apply on its own, before them.
--
-- Closes two self-escalation paths found on 2026-10-08 and reproduced in
-- tests/db/privilege-escalation.test.ts:
--
--   1. profiles. The UPDATE policy (004/005) let anyone update their own
--      row with no column limits, and the INSERT policy let a fresh auth
--      user insert their own row. Every tenant and role check in the
--      database (ec_current_church_id, ec_current_role, ec_has_role,
--      ec_is_platform_admin) reads this table, so anyone who could sign up
--      could make themselves a platform admin, a church admin, or a member
--      of any church, with one API call.
--
--   2. user_profiles. "users can update own profile" (002) has no WITH
--      CHECK, so anyone could set their own scheduling role to 'admin' and
--      read or write every church's bookings, resources and attendees.
--
-- Policies cannot compare old and new values, so the column rules live in
-- BEFORE triggers. The triggers are SECURITY INVOKER on purpose: they test
-- current_user, which is the API role of the request (authenticated, anon,
-- service_role) or postgres for migrations and the SQL editor.
--
-- No application path is affected: signup, invites and the test harness
-- create profiles with the service role; role changes come from church
-- admins (setProfileRole, promoteProfile) inside their own church.
-- ============================================================

-- The server itself: migrations, the SQL editor, and service-role API calls.
CREATE OR REPLACE FUNCTION ec_is_server_role()
RETURNS BOOLEAN LANGUAGE sql STABLE
AS $$
  SELECT current_user IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin');
$$;

COMMENT ON FUNCTION ec_is_server_role() IS
  'TRUE for migrations, the SQL editor and service-role requests. Must stay '
  'SECURITY INVOKER: inside a SECURITY DEFINER function current_user is the '
  'owner, which would make every caller look like the server.';

-- Which church a campus belongs to, regardless of the caller's RLS.
CREATE OR REPLACE FUNCTION ec_campus_church_id(cid UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT church_id FROM campuses WHERE id = cid;
$$;

-- ── profiles ─────────────────────────────────────────────────

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

  -- Roles are granted by a church admin of the person's own church. Nobody
  -- grants themselves a role (a church admin stepping down is allowed).
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

  -- Consent to be texted belongs to the person. Staff cannot record it for
  -- someone else; server code that captures consent on a person's behalf
  -- (with their attestation) runs as the service role.
  IF (NEW.sms_consent_at IS DISTINCT FROM OLD.sms_consent_at
      OR NEW.sms_consent_source IS DISTINCT FROM OLD.sms_consent_source)
     AND NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the person can change their texting consent.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileges ON profiles;
CREATE TRIGGER profiles_guard_privileges
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION ec_guard_profile_privileges();

-- No application path inserts a profile through a user session.
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

-- ── user_profiles (SchedulingCore) ───────────────────────────
-- Policy-level guard only; no code under /lib/scheduling or
-- /app/scheduling changes.

CREATE OR REPLACE FUNCTION scheduling_guard_user_profile_privileges()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF ec_is_server_role() OR scheduling_has_role('admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.manager_location_id IS DISTINCT FROM OLD.manager_location_id THEN
    RAISE EXCEPTION 'Only a scheduling admin can change scheduling roles.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_guard_privileges ON user_profiles;
CREATE TRIGGER user_profiles_guard_privileges
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION scheduling_guard_user_profile_privileges();

-- ── audit_log ────────────────────────────────────────────────
-- Inserts were pinned to the actor but not to a church, so anyone could
-- write rows into another church's audit trail.

DROP POLICY IF EXISTS "audit_insert_self" ON audit_log;
CREATE POLICY "audit_insert_self"
  ON audit_log FOR INSERT TO authenticated
  WITH CHECK (
    ec_is_platform_admin()
    OR (
      actor_id = auth.uid()
      AND (church_id IS NULL OR church_id = ec_current_church_id())
    )
  );

-- ── API grants for the objects above ─────────────────────────
GRANT EXECUTE ON FUNCTION ec_is_server_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ec_campus_church_id(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
