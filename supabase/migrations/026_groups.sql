-- ============================================================
-- 026_groups.sql
-- Groups + membership: the single mechanism that decides who can
-- see and who gets notified about an event (migration 027).
--
-- Design decision (2026-08-17): audience targeting is done with
-- EXPLICIT, church-curated group membership. We deliberately do
-- NOT store gender, age, marital status, or any other inferred
-- demographic on profiles.
--
-- The canonical example: a women's "girls night" event must be
-- invisible to men. That works like this:
--
--   "Women"           kind='roster',   parent_group_id = NULL
--   "Women's Ministry" kind='ministry', parent_group_id = <Women>
--
-- The event targets Women's Ministry. The optional wider notify
-- ring ("invite those who might otherwise be left out") is the
-- PARENT group, minus people already in the target group. Men are
-- in neither group, so they resolve out of both the read set and
-- the recipient set — no demographic column required, and every
-- membership row is attributable and auditable.
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE ec_group_kind AS ENUM (
  'roster',      -- a membership pool that exists to be a parent/eligibility ring
  'ministry',
  'home_group',
  'age_stage',
  'interest',
  'serve',
  'custom'
);

CREATE TYPE ec_group_member_role AS ENUM ('member', 'leader');

-- ── Groups ───────────────────────────────────────────────────

CREATE TABLE groups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  campus_id         UUID REFERENCES campuses(id) ON DELETE SET NULL,

  name              TEXT NOT NULL,
  slug              TEXT,
  kind              ec_group_kind NOT NULL DEFAULT 'custom',
  description       TEXT,

  -- The eligibility ring. When an event targeting this group opts into
  -- invite_ring='members_plus_eligible', the parent's members are notified
  -- AND granted read access (see 027 — notifying without access would send
  -- people a link to a 403).
  parent_group_id   UUID REFERENCES groups(id) ON DELETE SET NULL,

  -- Private groups are hidden from the group directory for non-members.
  -- This is about the GROUP's discoverability; event visibility is decided
  -- separately, per event, in 027.
  is_private        BOOLEAN NOT NULL DEFAULT FALSE,

  leader_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Optional association with a serve_teams row (006). Kept as a link rather
  -- than a backfill/migration so the two stay independently editable.
  serve_team_id     UUID REFERENCES serve_teams(id) ON DELETE SET NULL,

  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A group cannot be its own parent. Deeper cycles are prevented in the
  -- app layer (setGroupParent walks the chain); this catches the common slip.
  CONSTRAINT chk_group_parent_not_self CHECK (parent_group_id IS NULL OR parent_group_id <> id)
);

CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_groups_church ON groups(church_id);
CREATE INDEX idx_groups_campus ON groups(campus_id);
CREATE INDEX idx_groups_parent ON groups(parent_group_id);

-- Slug unique within a church when present (mirrors campuses.slug in 012).
CREATE UNIQUE INDEX idx_groups_slug_per_church
  ON groups(church_id, slug)
  WHERE slug IS NOT NULL;

COMMENT ON COLUMN groups.parent_group_id IS
  'Eligibility ring. Members of the parent are the "could also be invited" '
  'audience for events targeting this group.';

-- ── Membership ───────────────────────────────────────────────

CREATE TABLE group_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role                ec_group_member_role NOT NULL DEFAULT 'member',
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (group_id, profile_id)
);

CREATE INDEX idx_group_members_group   ON group_members(group_id);
CREATE INDEX idx_group_members_profile ON group_members(profile_id);

-- ── Helpers ──────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing here, twice over:
--   1. It bypasses RLS on group_members, so the groups policies below can
--      consult membership without recursing back through group_members'
--      own policies (which scope through groups).
--   2. It lets a member confirm their own membership in a private group
--      they otherwise couldn't enumerate.

CREATE OR REPLACE FUNCTION ec_is_group_member(gid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND profile_id = auth.uid()
  );
$$;

-- Every group id the current user belongs to. Used by the event visibility
-- rule in 027 and by "my groups" views.
CREATE OR REPLACE FUNCTION ec_my_group_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT group_id FROM group_members WHERE profile_id = auth.uid();
$$;

-- True when the current user leads the group (explicit leader row, or the
-- denormalized groups.leader_profile_id). Group leaders manage their own
-- roster without needing campus_admin.
CREATE OR REPLACE FUNCTION ec_is_group_leader(gid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND profile_id = auth.uid() AND role = 'leader'
  ) OR EXISTS (
    SELECT 1 FROM groups
    WHERE id = gid AND leader_profile_id = auth.uid()
  );
$$;

-- ── RLS: groups ──────────────────────────────────────────────

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Read: same-church staff see everything; any same-church member sees
-- non-private groups (the directory) plus any private group they belong to.
CREATE POLICY "groups_read"
  ON groups FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (
      church_id = ec_current_church_id()
      AND (
        ec_has_role('connector')          -- connector, campus_admin, church_admin
        OR is_private = FALSE
        OR ec_is_group_member(id)
      )
    )
  );

CREATE POLICY "groups_write_admin"
  ON groups FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── RLS: group_members ───────────────────────────────────────

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- Read: staff; your own membership rows; and the roster of any group you
-- belong to (so a home group can see who else is in it).
CREATE POLICY "group_members_read"
  ON group_members FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR profile_id = auth.uid()
    OR ec_is_group_member(group_id)
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.church_id = ec_current_church_id()
        AND ec_has_role('connector')
    )
  );

-- Write: campus_admin+ in the group's church, or the group's own leader.
CREATE POLICY "group_members_write"
  ON group_members FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR ec_is_group_leader(group_id)
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR ec_is_group_leader(group_id)
    OR EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.church_id = ec_current_church_id()
        AND ec_has_role('campus_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
