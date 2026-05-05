-- Migration 010: campus landing page fields
--
-- Each campus gets a small set of fields that drive its participant-facing
-- landing page (rendered above the step list on /journey for participants
-- assigned to that campus). All optional.
--
-- - hero_image_url: URL to the hero image shown at the top of the landing page.
-- - intro_text: short tagline / one-paragraph intro shown beneath the hero.
-- - body: long-form markdown body. Surfaced as plain whitespace-pre-wrap for
--   now; will get a real markdown renderer when one is added project-wide.
-- - brand_color: hex string used for accents specific to this campus
--   (e.g. the Youth Connection campus might use a different accent than main).

ALTER TABLE campuses
  ADD COLUMN hero_image_url TEXT,
  ADD COLUMN intro_text     TEXT,
  ADD COLUMN body           TEXT,
  ADD COLUMN brand_color    TEXT;

COMMENT ON COLUMN campuses.hero_image_url IS
  'Optional URL for the hero image shown on the campus landing page.';
COMMENT ON COLUMN campuses.intro_text IS
  'Short tagline / paragraph displayed beneath the hero on the campus landing page.';
COMMENT ON COLUMN campuses.body IS
  'Long-form markdown body for the campus landing page.';
COMMENT ON COLUMN campuses.brand_color IS
  'Hex color (e.g. #14b8a6) used for campus-specific accents on the landing page.';
