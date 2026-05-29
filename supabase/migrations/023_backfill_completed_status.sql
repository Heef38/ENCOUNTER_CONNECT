-- Migration 023: backfill completed journey status
--
-- Completing the last journey step now sets participants.status = 'completed'
-- (see completeStepAndAdvance). This backfills participants who finished
-- their journey before that was tracked: every progress row is done (none
-- pending or in_progress) and they have at least one step. Deliberately
-- leaves 'inactive' participants alone. Idempotent.

UPDATE participants p
SET status = 'completed'
WHERE p.status NOT IN ('completed', 'inactive')
  AND EXISTS (
    SELECT 1 FROM participant_progress pp WHERE pp.participant_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM participant_progress pp
    WHERE pp.participant_id = p.id
      AND pp.status IN ('pending', 'in_progress')
  );
