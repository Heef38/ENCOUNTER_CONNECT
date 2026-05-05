-- Migration 012: campus slug for public-facing URLs
--
-- Each campus gets an optional slug used in public signup URLs like
-- /c/<church-slug>/<campus-slug>. Unique within a church but not globally.

ALTER TABLE campuses
  ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX idx_campuses_church_slug
  ON campuses(church_id, slug)
  WHERE slug IS NOT NULL;

COMMENT ON COLUMN campuses.slug IS
  'URL slug for the campus, unique within a church. Used by /c/<church>/<campus> signup URLs.';
