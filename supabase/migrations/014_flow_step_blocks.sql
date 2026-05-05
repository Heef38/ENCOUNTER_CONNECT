-- Migration 014: function-block flow steps + video step type
--
-- Makes the implicit "trigger" and "output" of each flow step explicit
-- so the flow editor can render each step as a labeled block:
--   TRIGGER  ▸  ACTION  ▸  OUTPUT
--
-- Existing rows default to trigger='previous_complete' and output='advance',
-- which matches the pre-014 behavior (each step activates when the prior
-- one finishes; completing a step advances to the next).
--
-- Also introduces a 'video' step type. Video steps reference one or more
-- lessons via flow_step_lessons; lessons gain an optional video_url so
-- participants can watch without leaving the journey.

-- ── Trigger / Output enums ──────────────────────────────────

CREATE TYPE ec_flow_trigger_kind AS ENUM (
  'signup',              -- the participant just joined and was assigned a campus
  'previous_complete',   -- the previous step was marked complete (default)
  'event_attended',      -- a tracked event was attended
  'time_delay'           -- N hours/days after the previous step
);

CREATE TYPE ec_flow_output_kind AS ENUM (
  'advance',                -- default: move to the next step
  'notify_connector',       -- send a notification to the assigned connector
  'auto_match_connector'    -- assign best-fit connector based on availability
);

ALTER TABLE flow_steps
  ADD COLUMN trigger_kind ec_flow_trigger_kind NOT NULL DEFAULT 'previous_complete',
  ADD COLUMN output_kind  ec_flow_output_kind  NOT NULL DEFAULT 'advance';

COMMENT ON COLUMN flow_steps.trigger_kind IS
  'What activates this step. The first step in a flow typically uses ''signup''.';
COMMENT ON COLUMN flow_steps.output_kind IS
  'What happens when this step completes. ''auto_match_connector'' runs availability-based matching at the schedule step.';

-- ── Video step type ─────────────────────────────────────────

ALTER TYPE ec_flow_step_type ADD VALUE 'video';

-- Optional video URL on lessons. A lesson without video_url is markdown-only.
ALTER TABLE lessons
  ADD COLUMN video_url TEXT;

-- ── flow_step_lessons (join) ────────────────────────────────

CREATE TABLE flow_step_lessons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_step_id  UUID NOT NULL REFERENCES flow_steps(id) ON DELETE CASCADE,
  lesson_id     UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_step_id, lesson_id)
);

CREATE INDEX idx_flow_step_lessons_step ON flow_step_lessons(flow_step_id, order_index);

ALTER TABLE flow_step_lessons ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user whose church owns the parent flow.
-- (Participants need to read this to render the video step on /journey.)
CREATE POLICY "flow_step_lessons_read"
  ON flow_step_lessons FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM flow_steps fs
      JOIN flows f ON f.id = fs.flow_id
      WHERE fs.id = flow_step_lessons.flow_step_id
        AND f.church_id = ec_current_church_id()
    )
  );

-- Write: campus_admin+ within the same church.
CREATE POLICY "flow_step_lessons_write"
  ON flow_step_lessons FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM flow_steps fs
      JOIN flows f ON f.id = fs.flow_id
      WHERE fs.id = flow_step_lessons.flow_step_id
        AND f.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM flow_steps fs
      JOIN flows f ON f.id = fs.flow_id
      WHERE fs.id = flow_step_lessons.flow_step_id
        AND f.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );
