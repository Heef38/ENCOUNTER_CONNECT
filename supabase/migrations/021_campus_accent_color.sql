-- Migration 021: second campus theming color
--
-- campuses.brand_color is the primary journey color (buttons, progress,
-- active highlights). accent_color is a secondary highlight color used for
-- accents on the participant journey. Both optional; fall back to defaults.

ALTER TABLE campuses ADD COLUMN accent_color TEXT;

COMMENT ON COLUMN campuses.accent_color IS
  'Secondary journey accent color (hex). Pairs with brand_color (primary).';

NOTIFY pgrst, 'reload schema'; 
