-- Migration 016: many-to-many participant_connectors
--
-- Multiple connectors can share a participant (a "team" of connectors).
-- One of them is the primary; the rest are secondary. The existing
-- `participants.assigned_connector_id` column is preserved as a
-- denormalized cache pointing to the primary so existing reads keep
-- working without rewrites.
--
-- Why a join table instead of an array column or extra connector slots:
-- per-row metadata (assigned_at, assigned_by_profile_id, role) is useful
-- for audit + UI, and the join table is the natural place for it.

CREATE TYPE ec_connector_assignment_role AS ENUM ('primary', 'secondary');

CREATE TABLE participant_connectors (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id           UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  connector_id             UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  role                     ec_connector_assignment_role NOT NULL DEFAULT 'secondary',
  assigned_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by_profile_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes                    TEXT,
  UNIQUE (participant_id, connector_id)
);

CREATE INDEX idx_participant_connectors_participant ON participant_connectors(participant_id);
CREATE INDEX idx_participant_connectors_connector  ON participant_connectors(connector_id);

-- Only one primary per participant. Secondary assignments are unbounded.
CREATE UNIQUE INDEX idx_participant_connectors_one_primary
  ON participant_connectors(participant_id)
  WHERE role = 'primary';

ALTER TABLE participant_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participant_connectors_read_staff"
  ON participant_connectors FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_connectors.participant_id
        AND p.church_id = ec_current_church_id()
        AND ec_has_role('connector')
    )
  );

CREATE POLICY "participant_connectors_write_admin"
  ON participant_connectors FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_connectors.participant_id
        AND p.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_connectors.participant_id
        AND p.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );

-- Backfill: every existing assigned_connector_id becomes a primary row.
INSERT INTO participant_connectors (participant_id, connector_id, role, assigned_at)
SELECT id, assigned_connector_id, 'primary', COALESCE(updated_at, NOW())
  FROM participants
 WHERE assigned_connector_id IS NOT NULL
ON CONFLICT (participant_id, connector_id) DO NOTHING;
