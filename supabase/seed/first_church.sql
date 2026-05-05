-- First-church bootstrap.
-- Run this once in the Supabase SQL Editor (or via `supabase db query`)
-- to create your church record and link your admin profile to it.
--
-- Edit the variables below before running.

DO $$
DECLARE
  v_church_name     TEXT := 'Encounter';        -- ← set this
  v_church_slug     TEXT := 'encounter';             -- ← url-safe, lowercase
  v_church_timezone TEXT := 'America/Chicago';         -- ← IANA tz
  v_admin_email     TEXT := 'haynes.heath@gmail.com';  -- ← set this

  v_church_id UUID;
  v_user_id   UUID;
BEGIN
  -- 1. Find the auth user by email.
  SELECT id INTO v_user_id FROM auth.users WHERE email = v_admin_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth.users row found for %', v_admin_email;
  END IF;

  -- 2. Create the church (or reuse if a row with this slug already exists).
  INSERT INTO public.churches (name, slug, timezone, is_active)
  VALUES (v_church_name, v_church_slug, v_church_timezone, TRUE)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_church_id;

  -- 3. Make sure a profile row exists, then link it to the church
  --    and grant church_admin (platform admin gets it for free, but this
  --    makes the role explicit so role-based UI works).
  INSERT INTO public.profiles (id, role, church_id, is_platform_admin, first_name, last_name, email)
  VALUES (v_user_id, 'church_admin', v_church_id, TRUE, 'Heath', 'Haynes', v_admin_email)
  ON CONFLICT (id) DO UPDATE
    SET church_id = EXCLUDED.church_id,
        role      = CASE
                      WHEN public.profiles.role = 'participant' THEN 'church_admin'
                      ELSE public.profiles.role
                    END;

  RAISE NOTICE 'Church % linked to admin %', v_church_id, v_admin_email;
END $$;

-- Sanity check — should return one row, with church_id populated.
SELECT p.id, p.email, p.role, p.is_platform_admin, c.name AS church
FROM   public.profiles p
LEFT JOIN public.churches c ON c.id = p.church_id
WHERE  p.email = 'haynes.heath@gmail.com';
