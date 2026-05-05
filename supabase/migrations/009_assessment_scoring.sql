-- Migration 009: assessment scoring (categories, weights, per-option points)
--
-- Adds the data model needed to grade assessments:
-- 1. assessment_categories — the fixed buckets a participant scores against
--    (e.g. "Through Movement", "Through Service"). Each carries a body
--    (markdown) that is rendered into the participant's results document
--    when the category lands in their top N.
-- 2. assessment_questions.category_id — FK to the category a question
--    contributes points to. The legacy text `category` column is left
--    in place for now to avoid touching prior data.
-- 3. assessment_questions.weight — multiplier on the answer's raw points.
-- 4. Per-option points for choice / multi_choice live inside the existing
--    `options` JSONB column. Shape is now permissive:
--      either ["plain string", ...]              (legacy, score = 1 each)
--      or     [{ "label": "...", "points": N }] (new, scoring-aware)
--    No schema change for options; the scoring engine handles both.

CREATE TABLE assessment_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessment_definitions(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  body          TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, key)
);

CREATE TRIGGER assessment_categories_updated_at
  BEFORE UPDATE ON assessment_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_categories_assessment_order
  ON assessment_categories(assessment_id, order_index);

ALTER TABLE assessment_categories ENABLE ROW LEVEL SECURITY;

-- Read: same shape as assessment_questions — anyone in the church (incl. participants).
CREATE POLICY "categories_read_own_church"
  ON assessment_categories FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_categories.assessment_id
        AND (d.church_id = ec_current_church_id() OR ec_is_platform_admin())
    )
  );

-- Write: campus_admin+ in the same church.
CREATE POLICY "categories_write_admin"
  ON assessment_categories FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_categories.assessment_id
        AND (
          ec_is_platform_admin()
          OR (d.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_definitions d
      WHERE d.id = assessment_categories.assessment_id
        AND (
          ec_is_platform_admin()
          OR (d.church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
        )
    )
  );

-- Question additions
ALTER TABLE assessment_questions
  ADD COLUMN category_id UUID REFERENCES assessment_categories(id) ON DELETE SET NULL,
  ADD COLUMN weight NUMERIC NOT NULL DEFAULT 1;

CREATE INDEX idx_questions_category ON assessment_questions(category_id);

COMMENT ON COLUMN assessment_questions.weight IS
  'Multiplier applied to the answer''s raw points before adding to the category total.';
COMMENT ON COLUMN assessment_questions.category_id IS
  'Category this question contributes to. Null = unscored.';
COMMENT ON TABLE assessment_categories IS
  'Score buckets per assessment. Each carries pre-written markdown shown to the participant when in their top results.';
