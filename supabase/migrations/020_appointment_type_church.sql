-- Migration 020: scope appointment types to a church
--
-- scheduling_appointment_types is a scheduling-core (domain-neutral) table and
-- was previously global/shared across every church. Encounter Connect is
-- multi-tenant, so appointment types must belong to a church.
--
-- Kept NULLABLE so the scheduling core's own createAppointmentType (which
-- doesn't set church_id) still works; EC always sets it on create, and EC
-- screens filter by the current church.

ALTER TABLE scheduling_appointment_types
  ADD COLUMN church_id UUID REFERENCES churches(id) ON DELETE CASCADE;

-- Backfill from the flows that actually use each type (most accurate).
UPDATE scheduling_appointment_types AS at
SET church_id = sub.church_id
FROM (
  SELECT DISTINCT fs.appointment_type_id, f.church_id
  FROM flow_steps fs
  JOIN flows f ON f.id = fs.flow_id
  WHERE fs.appointment_type_id IS NOT NULL
) AS sub
WHERE at.id = sub.appointment_type_id
  AND at.church_id IS NULL;

-- Any remaining unreferenced types fall back to the oldest church
-- (correct for single-church deployments).
UPDATE scheduling_appointment_types
SET church_id = (SELECT id FROM churches ORDER BY created_at LIMIT 1)
WHERE church_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_types_church
  ON scheduling_appointment_types(church_id);

NOTIFY pgrst, 'reload schema';
