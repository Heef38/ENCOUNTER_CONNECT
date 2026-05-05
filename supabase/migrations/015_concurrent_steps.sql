-- Migration 015: concurrent flow steps via phase_index
--
-- Adds a phase grouping to flow_steps so multiple steps can run in parallel:
-- steps that share a phase_index are concurrent (any order, all required
-- ones must complete before the flow advances to the next phase).
--
-- Backfill rule: phase_index = order_index. That puts every existing step
-- in its own phase, so the linear behavior of pre-015 is preserved exactly.
--
-- Phase ordering: smallest phase_index first. Phase numbers may be sparse
-- (e.g. 0, 1, 1, 4) — that's fine; the engine iterates by ascending value
-- not by adjacency.

ALTER TABLE flow_steps
  ADD COLUMN phase_index INTEGER NOT NULL DEFAULT 0;

-- Backfill: each existing step is its own phase.
UPDATE flow_steps
   SET phase_index = order_index;

CREATE INDEX idx_flow_steps_flow_phase ON flow_steps(flow_id, phase_index);

COMMENT ON COLUMN flow_steps.phase_index IS
  'Steps with the same phase_index in the same flow are concurrent. The flow advances to the next phase only after every required step in the current phase is completed.';
