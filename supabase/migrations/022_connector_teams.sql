-- Migration 022: connector teams
--
-- Connectors often work as a fixed pair (frequently husband/wife) and run
-- the connect meeting together. A team owns a SINGLE shared scheduling
-- resource: either member edits the one calendar, participants book the
-- team as a unit, and meeting notifications fan out to both members.
--
-- Decisions baked in here:
--   * A team has exactly 2 members. "Exactly 2" is enforced in the app
--     layer (createTeam); the schema enforces the weaker, durable invariant
--     that a connector belongs to at most one team (UNIQUE on connector_id).
--   * While on a team, a connector's individual availability is superseded —
--     slot generation represents the team via connector_teams.scheduling_resource_id
--     and skips the members' personal resources.

CREATE TABLE connector_teams (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id              UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  campus_id              UUID REFERENCES campuses(id) ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  -- The team's shared availability calendar. Provisioned by createTeam.
  scheduling_resource_id UUID REFERENCES scheduling_resources(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER connector_teams_updated_at
  BEFORE UPDATE ON connector_teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_connector_teams_church ON connector_teams(church_id);
CREATE INDEX idx_connector_teams_campus ON connector_teams(campus_id);

CREATE TABLE connector_team_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES connector_teams(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (connector_id),          -- a connector is on at most one team
  UNIQUE (team_id, connector_id)
);

CREATE INDEX idx_connector_team_members_team ON connector_team_members(team_id);

-- ── RLS ──────────────────────────────────────────────────────
-- Mirrors connectors (005) and participant_connectors (016): staff in the
-- church read; campus_admin+ write. Membership rows scope through their team.

ALTER TABLE connector_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_teams_read_staff"
  ON connector_teams FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

CREATE POLICY "connector_teams_write_admin"
  ON connector_teams FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

ALTER TABLE connector_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connector_team_members_read_staff"
  ON connector_team_members FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM connector_teams t
      WHERE t.id = connector_team_members.team_id
        AND t.church_id = ec_current_church_id()
        AND ec_has_role('connector')
    )
  );

CREATE POLICY "connector_team_members_write_admin"
  ON connector_team_members FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM connector_teams t
      WHERE t.id = connector_team_members.team_id
        AND t.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM connector_teams t
      WHERE t.id = connector_team_members.team_id
        AND t.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );
