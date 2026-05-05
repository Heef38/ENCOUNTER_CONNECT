-- ============================================================
-- 005_multi_tenant.sql
-- Introduces the `churches` tenant table and scopes all
-- Encounter Connect tables by church_id. Seeds a default
-- church and backfills existing rows into it.
-- ============================================================

-- ── Churches ─────────────────────────────────────────────────

CREATE TABLE churches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  timezone    TEXT NOT NULL DEFAULT 'America/Chicago',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER churches_updated_at
  BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Stable default-church id used to backfill pre-multi-tenant rows.
INSERT INTO churches (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Church', 'default');

-- ── Add church_id to EC tables + platform admin flag ─────────

ALTER TABLE campuses        ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE CASCADE;
ALTER TABLE profiles        ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE SET NULL;
ALTER TABLE profiles        ADD COLUMN is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE connectors      ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE CASCADE;
ALTER TABLE participants    ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE CASCADE;
ALTER TABLE flows           ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE CASCADE;

UPDATE campuses     SET church_id = '00000000-0000-0000-0000-000000000001';
UPDATE profiles     SET church_id = '00000000-0000-0000-0000-000000000001';
UPDATE connectors   SET church_id = '00000000-0000-0000-0000-000000000001';
UPDATE participants SET church_id = '00000000-0000-0000-0000-000000000001';
UPDATE flows        SET church_id = '00000000-0000-0000-0000-000000000001';

ALTER TABLE campuses     ALTER COLUMN church_id SET NOT NULL;
ALTER TABLE connectors   ALTER COLUMN church_id SET NOT NULL;
ALTER TABLE participants ALTER COLUMN church_id SET NOT NULL;
ALTER TABLE flows        ALTER COLUMN church_id SET NOT NULL;
-- profiles.church_id stays nullable: platform admins belong to no single church.

CREATE INDEX idx_campuses_church     ON campuses(church_id);
CREATE INDEX idx_profiles_church     ON profiles(church_id);
CREATE INDEX idx_connectors_church   ON connectors(church_id);
CREATE INDEX idx_participants_church ON participants(church_id);
CREATE INDEX idx_flows_church        ON flows(church_id);

-- Default-flow uniqueness is now scoped per (church, campus).
DROP INDEX IF EXISTS idx_flows_one_default_per_campus;
DROP INDEX IF EXISTS idx_flows_one_global_default;

CREATE UNIQUE INDEX idx_flows_one_default_per_campus
  ON flows(church_id, campus_id)
  WHERE is_default = TRUE AND campus_id IS NOT NULL;

CREATE UNIQUE INDEX idx_flows_one_default_per_church
  ON flows(church_id)
  WHERE is_default = TRUE AND campus_id IS NULL;

-- ── RLS helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Replaces the 004 helper so current_church_id is looked up via profiles.
CREATE OR REPLACE FUNCTION ec_current_church_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT church_id FROM profiles WHERE id = auth.uid();
$$;

-- Platform admins short-circuit to TRUE regardless of required role.
CREATE OR REPLACE FUNCTION ec_has_role(required ec_user_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT ec_is_platform_admin() OR CASE ec_current_role()
    WHEN 'church_admin'  THEN TRUE
    WHEN 'campus_admin'  THEN required IN ('campus_admin','connector','participant')
    WHEN 'connector'     THEN required IN ('connector','participant')
    WHEN 'participant'   THEN required = 'participant'
    ELSE FALSE
  END;
$$;

-- ── Churches RLS ─────────────────────────────────────────────

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "churches_read_own_or_platform"
  ON churches FOR SELECT TO authenticated
  USING (id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "churches_write_platform"
  ON churches FOR ALL TO authenticated
  USING (ec_is_platform_admin())
  WITH CHECK (ec_is_platform_admin());

-- ── Replace 004 policies with church-scoped versions ─────────

-- campuses
DROP POLICY IF EXISTS "campuses_read_authenticated" ON campuses;
CREATE POLICY "campuses_read_own_church" ON campuses FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

DROP POLICY IF EXISTS "campuses_write_church_admin" ON campuses;
CREATE POLICY "campuses_write_church_admin" ON campuses FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('church_admin'))
  );

-- profiles
DROP POLICY IF EXISTS "profiles_read_admin_or_own" ON profiles;
CREATE POLICY "profiles_read_admin_or_own" ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
CREATE POLICY "profiles_update_own_or_admin" ON profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    id = auth.uid()
    OR ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- connectors
DROP POLICY IF EXISTS "connectors_read_staff" ON connectors;
CREATE POLICY "connectors_read_staff" ON connectors FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

DROP POLICY IF EXISTS "connectors_write_admin" ON connectors;
CREATE POLICY "connectors_write_admin" ON connectors FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- participants
DROP POLICY IF EXISTS "participants_read_staff" ON participants;
CREATE POLICY "participants_read_staff" ON participants FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

DROP POLICY IF EXISTS "participants_write_staff" ON participants;
CREATE POLICY "participants_write_staff" ON participants FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

-- flows
DROP POLICY IF EXISTS "flows_read_authenticated" ON flows;
CREATE POLICY "flows_read_own_church" ON flows FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

DROP POLICY IF EXISTS "flows_write_admin" ON flows;
CREATE POLICY "flows_write_admin" ON flows FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- flow_steps: scoped via parent flow
DROP POLICY IF EXISTS "flow_steps_read_authenticated" ON flow_steps;
CREATE POLICY "flow_steps_read_own_church" ON flow_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM flows f
      WHERE f.id = flow_steps.flow_id
        AND (f.church_id = ec_current_church_id() OR ec_is_platform_admin())
    )
  );

DROP POLICY IF EXISTS "flow_steps_write_admin" ON flow_steps;
CREATE POLICY "flow_steps_write_admin" ON flow_steps FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM flows f
      WHERE f.id = flow_steps.flow_id
        AND (
          ec_is_platform_admin()
          OR (f.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flows f
      WHERE f.id = flow_steps.flow_id
        AND (
          ec_is_platform_admin()
          OR (f.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  );

-- participant_progress: scoped via parent participant
DROP POLICY IF EXISTS "progress_read_staff" ON participant_progress;
CREATE POLICY "progress_read_staff" ON participant_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_progress.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

DROP POLICY IF EXISTS "progress_write_staff" ON participant_progress;
CREATE POLICY "progress_write_staff" ON participant_progress FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_progress.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_progress.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );
