-- Migration 008: flow_steps.assessment_kind
--
-- For step_type='assessment' steps, links the step to a specific assessment
-- kind (personal / connect_with_god / spiritual_gifts) so the participant
-- journey UI knows which questionnaire to render. Nullable: legacy steps
-- and non-assessment steps leave it null.

ALTER TABLE flow_steps
  ADD COLUMN assessment_kind ec_assessment_kind;

COMMENT ON COLUMN flow_steps.assessment_kind IS
  'Required when step_type = ''assessment''. Selects which assessment definition to render.';
