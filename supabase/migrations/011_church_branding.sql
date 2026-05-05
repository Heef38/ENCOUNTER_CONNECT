-- Migration 011: per-church branding fields
--
-- Adds optional branding columns to churches so platform admins can
-- distinguish tenants and surface church-level identity in the UI
-- (e.g. logo on the EC nav, brand color used as the default accent
-- when a campus hasn't set its own).
--
-- All nullable. RLS already restricts writes to platform admins.

ALTER TABLE churches
  ADD COLUMN logo_url    TEXT,
  ADD COLUMN brand_color TEXT,
  ADD COLUMN description TEXT;

COMMENT ON COLUMN churches.logo_url IS
  'Optional URL for the church logo. Shown in the nav and on the participant landing.';
COMMENT ON COLUMN churches.brand_color IS
  'Default hex accent color for the church. Campuses can override.';
COMMENT ON COLUMN churches.description IS
  'Short description shown on platform admin views.';
