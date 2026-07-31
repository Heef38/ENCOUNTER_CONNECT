-- Migration 025: Supabase Storage buckets + RLS
--
-- Two buckets, both using the path convention `<church_id>/...` so storage
-- policies can scope access by tenant:
--
--   * church-assets  (PUBLIC)  — church logos, campus hero images, lesson
--     media. Objects are world-readable via their public CDN URL; the
--     policies below only govern API access (list/upload/delete).
--   * connect-docs   (PRIVATE) — files attached to connect_docs rows.
--     Read requires an authenticated same-church user; the app serves these
--     through short-lived signed URLs (see lib/storage/files.ts).
--
-- App uploads run through server actions with the service-role key (which
-- bypasses RLS); these policies exist so direct client access — now or
-- later — can never cross a tenant boundary.

INSERT INTO storage.buckets (id, name, public)
VALUES ('church-assets', 'church-assets', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('connect-docs', 'connect-docs', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── church-assets ────────────────────────────────────────────
-- Staff (campus_admin+) manage files under their own church's folder.
-- Platform admins pass ec_has_role automatically.

CREATE POLICY "church_assets_staff_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'church-assets'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

CREATE POLICY "church_assets_staff_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'church-assets'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

CREATE POLICY "church_assets_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'church-assets'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

-- Listing within your own church folder (the public CDN URL needs no policy).
CREATE POLICY "church_assets_same_church_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'church-assets'
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

-- ── connect-docs ─────────────────────────────────────────────
-- Any authenticated member of the church can read (the connect_docs table's
-- own RLS/visibility governs which rows — and therefore which file paths —
-- a user is shown; signed URLs add a second layer for participants).

CREATE POLICY "connect_docs_same_church_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'connect-docs'
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

CREATE POLICY "connect_docs_staff_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'connect-docs'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

CREATE POLICY "connect_docs_staff_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'connect-docs'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

CREATE POLICY "connect_docs_staff_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'connect-docs'
    AND ec_has_role('campus_admin')
    AND (
      ec_is_platform_admin()
      OR (storage.foldername(name))[1] = ec_current_church_id()::text
    )
  );

NOTIFY pgrst, 'reload schema';
