-- ============================================================
-- 030_api_grants.sql
--
-- Supabase stops exposing new public-schema objects to the Data API
-- roles without explicit grants (permanent on 2026-10-30; see
-- supabase/config.toml). Migrations 001-025 were written for the old
-- auto-expose behavior and contain no grants, so on a fresh database
-- (a local `supabase db reset`, a new hosted project) none of their
-- tables is reachable at all.
--
-- This migration states the privileges the app actually needs, least
-- privilege first. It is safe on the existing hosted project, where it
-- also removes grants the legacy default handed out but nothing uses:
--
--   authenticated  SELECT/INSERT/UPDATE/DELETE on every table. Row-level
--                  security decides which rows. (No TRUNCATE, REFERENCES
--                  or TRIGGER: RLS does not govern those.)
--   service_role   everything. It bypasses RLS by design.
--   anon           nothing. Every signed-out page reads through the
--                  service role with an explicit public filter, so the
--                  anonymous Data API role never needs a table.
--
-- Default privileges cover objects created later by migrations; each new
-- migration still grants its own objects explicitly in case the platform
-- strips defaults.
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ── Sequences ────────────────────────────────────────────────
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ── Functions ────────────────────────────────────────────────
-- RLS policies call the ec_* and scheduling_* helpers as the querying
-- role, so authenticated needs EXECUTE on them.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- ── Future objects created by the migration role ─────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
