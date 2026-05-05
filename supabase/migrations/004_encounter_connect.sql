-- ============================================================
-- 004_encounter_connect.sql
-- Encounter Connect domain tables
-- Extends SchedulingCore without modifying any existing tables.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE ec_user_role AS ENUM (
  'church_admin',
  'campus_admin',
  'connector',
  'participant'
);

CREATE TYPE ec_participant_status AS ENUM (
  'new',
  'in_progress',
  'connected',
  'completed',
  'inactive'
);

CREATE TYPE ec_flow_step_type AS ENUM (
  'manual',
  'schedule',
  'event',
  'conversation',
  'assessment'
);

CREATE TYPE ec_progress_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'skipped'
);

-- ── Helper: updated_at trigger ────────────────────────────────

-- Reuse the same trigger function already defined by scheduling core
-- (set_updated_at). If it doesn't exist yet, create it here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

-- ── Campuses ─────────────────────────────────────────────────
-- Church campuses. Optionally linked to a scheduling_location
-- so the scheduler can scope resources by campus.

CREATE TABLE campuses (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  location                TEXT,
  scheduling_location_id  UUID REFERENCES scheduling_locations(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER campuses_updated_at
  BEFORE UPDATE ON campuses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Profiles ─────────────────────────────────────────────────
-- Encounter Connect user profiles. Linked to auth.users.
-- Separate from scheduling's user_profiles to avoid coupling.

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        ec_user_role NOT NULL DEFAULT 'participant',
  campus_id   UUID REFERENCES campuses(id) ON DELETE SET NULL,
  first_name  TEXT NOT NULL DEFAULT '',
  last_name   TEXT NOT NULL DEFAULT '',
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_profiles_campus ON profiles(campus_id);
CREATE INDEX idx_profiles_role ON profiles(role);

-- ── Connectors ───────────────────────────────────────────────
-- People assigned to guide participants through their journey.
-- Optionally linked to a scheduling_resource so the scheduler
-- can manage their availability and bookings.

CREATE TABLE connectors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campus_id               UUID REFERENCES campuses(id) ON DELETE SET NULL,
  scheduling_resource_id  UUID REFERENCES scheduling_resources(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER connectors_updated_at
  BEFORE UPDATE ON connectors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_connectors_campus ON connectors(campus_id);
CREATE INDEX idx_connectors_profile ON connectors(profile_id);

-- ── Participants ──────────────────────────────────────────────
-- Individuals going through the connection journey.
-- Can optionally be linked to a profile (authenticated user).

CREATE TABLE participants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  campus_id             UUID REFERENCES campuses(id) ON DELETE SET NULL,
  assigned_connector_id UUID REFERENCES connectors(id) ON DELETE SET NULL,
  status                ec_participant_status NOT NULL DEFAULT 'new',
  profile_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_participants_campus ON participants(campus_id);
CREATE INDEX idx_participants_connector ON participants(assigned_connector_id);
CREATE INDEX idx_participants_status ON participants(status);

-- ── Flows ────────────────────────────────────────────────────
-- Named journey templates. Each campus can have its own flows,
-- or share a global default flow (campus_id IS NULL).

CREATE TABLE flows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  campus_id   UUID REFERENCES campuses(id) ON DELETE SET NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER flows_updated_at
  BEFORE UPDATE ON flows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_flows_campus ON flows(campus_id);

-- Only one default flow per campus (NULL campus_id counts as global)
CREATE UNIQUE INDEX idx_flows_one_default_per_campus
  ON flows(campus_id)
  WHERE is_default = TRUE AND campus_id IS NOT NULL;

CREATE UNIQUE INDEX idx_flows_one_global_default
  ON flows((1))
  WHERE is_default = TRUE AND campus_id IS NULL;

-- ── Flow Steps ────────────────────────────────────────────────
-- Ordered steps within a flow. step_type drives how the app
-- handles progression (manual checkbox, scheduling link, etc.).

CREATE TABLE flow_steps (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id               UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  step_type             ec_flow_step_type NOT NULL DEFAULT 'manual',
  order_index           INTEGER NOT NULL DEFAULT 0,
  -- For schedule/event steps, links to an appointment type
  appointment_type_id   UUID REFERENCES scheduling_appointment_types(id) ON DELETE SET NULL,
  is_required           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER flow_steps_updated_at
  BEFORE UPDATE ON flow_steps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_flow_steps_flow ON flow_steps(flow_id, order_index);

-- ── Participant Progress ───────────────────────────────────────
-- Tracks each participant's completion of each flow step.
-- scheduled_event_id links to a scheduling_booking when the
-- step type is 'schedule' or 'event'.

CREATE TABLE participant_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id      UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  flow_step_id        UUID NOT NULL REFERENCES flow_steps(id) ON DELETE CASCADE,
  status              ec_progress_status NOT NULL DEFAULT 'pending',
  scheduled_event_id  UUID REFERENCES scheduling_bookings(id) ON DELETE SET NULL,
  completed_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_id, flow_step_id)
);

CREATE TRIGGER participant_progress_updated_at
  BEFORE UPDATE ON participant_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_progress_participant ON participant_progress(participant_id);
CREATE INDEX idx_progress_step ON participant_progress(flow_step_id);
CREATE INDEX idx_progress_status ON participant_progress(status);

-- ── RLS: Enable on all new tables ────────────────────────────

ALTER TABLE campuses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows               ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_steps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_progress ENABLE ROW LEVEL SECURITY;

-- ── RLS Helper ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_current_role()
RETURNS ec_user_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT role FROM profiles WHERE id = auth.uid()),
    'participant'::ec_user_role
  );
$$;

CREATE OR REPLACE FUNCTION ec_has_role(required ec_user_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE ec_current_role()
    WHEN 'church_admin'  THEN TRUE
    WHEN 'campus_admin'  THEN required IN ('campus_admin', 'connector', 'participant')
    WHEN 'connector'     THEN required IN ('connector', 'participant')
    WHEN 'participant'   THEN required = 'participant'
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION ec_current_campus_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT campus_id FROM profiles WHERE id = auth.uid();
$$;

-- ── RLS Policies: campuses ────────────────────────────────────

CREATE POLICY "campuses_read_authenticated"
  ON campuses FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "campuses_write_church_admin"
  ON campuses FOR ALL
  TO authenticated
  USING (ec_has_role('church_admin'))
  WITH CHECK (ec_has_role('church_admin'));

-- ── RLS Policies: profiles ────────────────────────────────────

CREATE POLICY "profiles_read_admin_or_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR ec_has_role('campus_admin')
  );

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own_or_admin"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR ec_has_role('campus_admin'))
  WITH CHECK (id = auth.uid() OR ec_has_role('campus_admin'));

-- ── RLS Policies: connectors ──────────────────────────────────

CREATE POLICY "connectors_read_staff"
  ON connectors FOR SELECT
  TO authenticated
  USING (ec_has_role('connector'));

CREATE POLICY "connectors_write_admin"
  ON connectors FOR ALL
  TO authenticated
  USING (ec_has_role('campus_admin'))
  WITH CHECK (ec_has_role('campus_admin'));

-- ── RLS Policies: participants ────────────────────────────────

CREATE POLICY "participants_read_staff"
  ON participants FOR SELECT
  TO authenticated
  USING (ec_has_role('connector'));

CREATE POLICY "participants_read_own"
  ON participants FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "participants_write_staff"
  ON participants FOR ALL
  TO authenticated
  USING (ec_has_role('connector'))
  WITH CHECK (ec_has_role('connector'));

-- ── RLS Policies: flows ───────────────────────────────────────

CREATE POLICY "flows_read_authenticated"
  ON flows FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "flows_write_admin"
  ON flows FOR ALL
  TO authenticated
  USING (ec_has_role('campus_admin'))
  WITH CHECK (ec_has_role('campus_admin'));

-- ── RLS Policies: flow_steps ──────────────────────────────────

CREATE POLICY "flow_steps_read_authenticated"
  ON flow_steps FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "flow_steps_write_admin"
  ON flow_steps FOR ALL
  TO authenticated
  USING (ec_has_role('campus_admin'))
  WITH CHECK (ec_has_role('campus_admin'));

-- ── RLS Policies: participant_progress ────────────────────────

CREATE POLICY "progress_read_staff"
  ON participant_progress FOR SELECT
  TO authenticated
  USING (ec_has_role('connector'));

CREATE POLICY "progress_read_own"
  ON participant_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_id AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "progress_write_staff"
  ON participant_progress FOR ALL
  TO authenticated
  USING (ec_has_role('connector'))
  WITH CHECK (ec_has_role('connector'));
