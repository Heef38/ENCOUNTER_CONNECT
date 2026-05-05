-- ============================================================
-- 006_ec_content.sql
-- Phase 2 data model: audit_log, lessons, assessments,
-- serve_teams, connect_docs, plus denormalized participant
-- columns (signed_up_at, last_action_at, current_step_id) and
-- a trigger to keep last_action_at fresh from progress events.
-- All new tables are church-scoped; assessment shape is shared
-- across kinds (personal / connect_with_god / spiritual_gifts)
-- so the customization layer can be added without reshaping later.
-- ============================================================

-- ── Audit log ────────────────────────────────────────────────

CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID REFERENCES churches(id) ON DELETE SET NULL,
  actor_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label  TEXT,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_church_created ON audit_log(church_id, created_at DESC);
CREATE INDEX idx_audit_actor          ON audit_log(actor_id);
CREATE INDEX idx_audit_entity         ON audit_log(entity_type, entity_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_read_staff"
  ON audit_log FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- Anyone authenticated can insert their own audit row; the helper
-- enforces actor_id = auth.uid() at the app layer.
CREATE POLICY "audit_insert_self"
  ON audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR ec_is_platform_admin());

-- ── Lessons ──────────────────────────────────────────────────

CREATE TABLE lessons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  slug         TEXT,
  body         TEXT,
  order_index  INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, slug)
);

CREATE TRIGGER lessons_updated_at
  BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_lessons_church_order ON lessons(church_id, order_index);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lessons_read_own_church"
  ON lessons FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "lessons_write_admin"
  ON lessons FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── Assessments ──────────────────────────────────────────────
-- Shared shape across the three kinds. Customization layer
-- (rubric / scoring) lives in the JSONB `scoring` column on the
-- definition, so future per-kind UIs can specialize without
-- changing the table shape.

CREATE TYPE ec_assessment_kind AS ENUM (
  'personal',
  'connect_with_god',
  'spiritual_gifts'
);

CREATE TYPE ec_question_type AS ENUM (
  'text',
  'long_text',
  'scale',
  'choice',
  'multi_choice',
  'boolean'
);

CREATE TABLE assessment_definitions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  kind        ec_assessment_kind NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  scoring     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER assessment_definitions_updated_at
  BEFORE UPDATE ON assessment_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_assessments_church_kind ON assessment_definitions(church_id, kind);

CREATE TABLE assessment_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  question_type ec_question_type NOT NULL DEFAULT 'text',
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,
  category      TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER assessment_questions_updated_at
  BEFORE UPDATE ON assessment_questions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_questions_assessment_order ON assessment_questions(assessment_id, order_index);

CREATE TABLE assessment_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id   UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  response_value  JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (participant_id, question_id)
);

CREATE TRIGGER assessment_responses_updated_at
  BEFORE UPDATE ON assessment_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_responses_participant ON assessment_responses(participant_id);
CREATE INDEX idx_responses_assessment  ON assessment_responses(assessment_id);

CREATE TABLE assessment_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  computed_score JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes          TEXT,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, participant_id)
);

CREATE INDEX idx_results_participant ON assessment_results(participant_id);

ALTER TABLE assessment_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_responses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results     ENABLE ROW LEVEL SECURITY;

-- definitions: church-scoped read, admin write
CREATE POLICY "assessments_read_own_church"
  ON assessment_definitions FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "assessments_write_admin"
  ON assessment_definitions FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- questions: scoped via parent definition
CREATE POLICY "questions_read_own_church"
  ON assessment_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_questions.assessment_id
        AND (d.church_id = ec_current_church_id() OR ec_is_platform_admin())
    )
  );

CREATE POLICY "questions_write_admin"
  ON assessment_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_questions.assessment_id
        AND (
          ec_is_platform_admin()
          OR (d.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_questions.assessment_id
        AND (
          ec_is_platform_admin()
          OR (d.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  );

-- responses: participants can read/write their own; staff in same church can read
CREATE POLICY "responses_read_own"
  ON assessment_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "responses_read_staff"
  ON assessment_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

CREATE POLICY "responses_write_own"
  ON assessment_responses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND p.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "responses_write_staff"
  ON assessment_responses FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_responses.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

-- results: staff (read+write) and the participant themselves (read only)
CREATE POLICY "results_read_own"
  ON assessment_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_results.participant_id
        AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "results_read_staff"
  ON assessment_results FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_results.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

CREATE POLICY "results_write_staff"
  ON assessment_results FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_results.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = assessment_results.participant_id
        AND (
          ec_is_platform_admin()
          OR (p.church_id = ec_current_church_id() AND ec_has_role('connector'))
        )
    )
  );

-- ── Serve teams ──────────────────────────────────────────────

CREATE TABLE serve_teams (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id          UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  campus_id          UUID REFERENCES campuses(id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  leader_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER serve_teams_updated_at
  BEFORE UPDATE ON serve_teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_serve_teams_church ON serve_teams(church_id);
CREATE INDEX idx_serve_teams_campus ON serve_teams(campus_id);

ALTER TABLE serve_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "serve_teams_read_own_church"
  ON serve_teams FOR SELECT TO authenticated
  USING (church_id = ec_current_church_id() OR ec_is_platform_admin());

CREATE POLICY "serve_teams_write_admin"
  ON serve_teams FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── Connect docs ─────────────────────────────────────────────

CREATE TYPE ec_doc_visibility AS ENUM ('staff', 'participants', 'public');

CREATE TABLE connect_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  campus_id   UUID REFERENCES campuses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  body        TEXT,
  file_url    TEXT,
  visibility  ec_doc_visibility NOT NULL DEFAULT 'staff',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER connect_docs_updated_at
  BEFORE UPDATE ON connect_docs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_connect_docs_church ON connect_docs(church_id);
CREATE INDEX idx_connect_docs_campus ON connect_docs(campus_id);

ALTER TABLE connect_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connect_docs_read_visibility"
  ON connect_docs FOR SELECT TO authenticated
  USING (
    is_active
    AND (
      ec_is_platform_admin()
      OR (
        church_id = ec_current_church_id()
        AND (
          visibility = 'public'
          OR (visibility = 'participants')
          OR (visibility = 'staff' AND ec_has_role('connector'))
        )
      )
    )
  );

CREATE POLICY "connect_docs_write_admin"
  ON connect_docs FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── Participants denormalization ─────────────────────────────

ALTER TABLE participants ADD COLUMN signed_up_at    TIMESTAMPTZ;
ALTER TABLE participants ADD COLUMN last_action_at  TIMESTAMPTZ;
ALTER TABLE participants ADD COLUMN current_step_id UUID REFERENCES flow_steps(id) ON DELETE SET NULL;

UPDATE participants SET signed_up_at = created_at WHERE signed_up_at IS NULL;

CREATE INDEX idx_participants_last_action ON participants(last_action_at DESC NULLS LAST);
CREATE INDEX idx_participants_current_step ON participants(current_step_id);

-- Trigger: bump last_action_at whenever a progress row is touched.
CREATE OR REPLACE FUNCTION ec_touch_participant_last_action()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE participants
     SET last_action_at = NOW()
   WHERE id = NEW.participant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER participant_progress_touches_participant
  AFTER INSERT OR UPDATE ON participant_progress
  FOR EACH ROW EXECUTE FUNCTION ec_touch_participant_last_action();
