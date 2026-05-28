-- Migration 019: connector meeting lifecycle + notes
--
-- The schedule step's participant_progress row links the booking. We track
-- the meeting's start/completion and the connector's notes here. The notes
-- become visible to the participant once `meeting_completed_at` is set
-- (no separate "shared" column needed).

ALTER TABLE participant_progress ADD COLUMN meeting_started_at   TIMESTAMPTZ;
ALTER TABLE participant_progress ADD COLUMN meeting_completed_at TIMESTAMPTZ;
ALTER TABLE participant_progress ADD COLUMN connector_notes      TEXT;

COMMENT ON COLUMN participant_progress.connector_notes IS
  'Connector''s meeting notes. Visible to the participant once meeting_completed_at is set.';

NOTIFY pgrst, 'reload schema';
