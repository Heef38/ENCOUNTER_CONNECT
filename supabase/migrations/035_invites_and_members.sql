-- ============================================================
-- 035_invites_and_members.sql
--
-- Church #2 readiness (rethink §10, slice 3).
--
--   1. Members are not newcomers. participants.joined_as says how a
--      person came in. Someone who says "I already belong here" stays out
--      of the newcomer stages, and an admin confirms them. An admin's
--      import or invite confirms at once. Standing (status 'connected',
--      which report auto-hide and hosting read) comes from the admin's
--      confirmation, never from the claim.
--   2. church_invites: email invites for a church's first admin, its
--      staff and its members, replacing typed temporary passwords. No row
--      holds a secret. The link is an HMAC of the invite id and a nonce
--      under a server-only key, so neither this table nor the outbox
--      (both readable by campus admins) holds a usable link, and a resend
--      rotates the nonce so older links stop working.
--   3. The pipeline gives members their own stage and a confirm flag.
--   4. Hosting rule v4: a confirmed member stands where a completed first
--      meeting does. The host orientation is still required.
--   5. Onboarding facts: service times for the public page, the church
--      agreement acceptance, and a test-tenant flag that can never be
--      verified or listed (§7.1).
-- ============================================================

-- ── 1. Members and guests ────────────────────────────────────

ALTER TABLE participants
  ADD COLUMN joined_as           TEXT NOT NULL DEFAULT 'guest'
                                 CHECK (joined_as IN ('guest', 'member')),
  ADD COLUMN member_confirmed_at TIMESTAMPTZ,
  ADD COLUMN member_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- The person's id in the church's previous system (a Planning Center
  -- person id, say), so re-running an import updates instead of
  -- duplicating.
  ADD COLUMN external_id         TEXT CHECK (external_id IS NULL OR length(external_id) <= 100),
  ADD COLUMN imported_at         TIMESTAMPTZ,
  ADD CONSTRAINT participants_confirmed_members_only
    CHECK (member_confirmed_at IS NULL OR joined_as = 'member');

COMMENT ON COLUMN participants.joined_as IS
  'guest: came in new. member: already belonged when they joined, by their own word or an admin''s.';
COMMENT ON COLUMN participants.member_confirmed_at IS
  'When an admin confirmed this member. Unconfirmed members wait in the confirm bucket.';

CREATE UNIQUE INDEX participants_church_external_id
  ON participants (church_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_participants_church_email
  ON participants (church_id, lower(email)) WHERE email IS NOT NULL;

-- Connectors write participants (participants_write_staff), so the
-- membership fields get their own rule: only a campus admin or church
-- admin of the person's church sets them, and a confirmation is signed by
-- the admin who made it.
CREATE OR REPLACE FUNCTION ec_guard_participant_membership()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  IF ec_is_server_role() OR ec_is_platform_admin() THEN
    RETURN NEW;
  END IF;

  is_admin := COALESCE(
    auth.uid() IS NOT NULL
    AND ec_has_role('campus_admin')
    AND NEW.church_id = ec_current_church_id()
    AND (TG_OP = 'INSERT' OR OLD.church_id = ec_current_church_id()),
    FALSE
  );

  IF TG_OP = 'INSERT' THEN
    IF (NEW.member_confirmed_at IS NOT NULL OR NEW.member_confirmed_by IS NOT NULL) AND NOT is_admin THEN
      RAISE EXCEPTION 'Only an admin of this church confirms a member.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.joined_as IS DISTINCT FROM OLD.joined_as
         OR NEW.member_confirmed_at IS DISTINCT FROM OLD.member_confirmed_at
         OR NEW.member_confirmed_by IS DISTINCT FROM OLD.member_confirmed_by)
        AND NOT is_admin THEN
    RAISE EXCEPTION 'Only an admin of this church changes membership.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.member_confirmed_by IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.member_confirmed_by IS DISTINCT FROM OLD.member_confirmed_by)
     AND NEW.member_confirmed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A confirmation is signed by the admin who made it.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER participants_guard_membership
  BEFORE INSERT OR UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION ec_guard_participant_membership();

-- ── 2. Invites ───────────────────────────────────────────────

CREATE TABLE church_invites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  email               TEXT NOT NULL CHECK (email = lower(btrim(email)) AND email LIKE '_%@_%'),
  first_name          TEXT CHECK (first_name IS NULL OR length(first_name) <= 100),
  last_name           TEXT CHECK (last_name IS NULL OR length(last_name) <= 100),
  phone               TEXT CHECK (phone IS NULL OR length(phone) <= 32),
  role                ec_user_role NOT NULL,
  campus_id           UUID REFERENCES campuses(id) ON DELETE SET NULL,
  -- An imported person this invite claims, so accepting links the
  -- account to the record the church already has.
  participant_id      UUID REFERENCES participants(id) ON DELETE SET NULL,
  -- Groups the person joins when they accept (from an import).
  group_ids           UUID[] NOT NULL DEFAULT '{}',
  -- Mixed into the link's HMAC. Not a secret; rotating it kills old links.
  nonce               TEXT NOT NULL CHECK (length(nonce) >= 16),
  invited_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  last_sent_at        TIMESTAMPTZ,
  send_count          INTEGER NOT NULL DEFAULT 0,
  accepted_at         TIMESTAMPTZ,
  accepted_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT church_invites_one_outcome CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

-- One open invite per person per church; inviting again refreshes it.
CREATE UNIQUE INDEX church_invites_open_email
  ON church_invites (church_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX idx_church_invites_church ON church_invites (church_id, created_at DESC);

-- Integrity for every writer, the server included: what an invite points
-- at belongs to the invite's church.
CREATE OR REPLACE FUNCTION ec_church_invites_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.campus_id IS NOT NULL
     AND ec_campus_church_id(NEW.campus_id) IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'That campus is not part of this church.' USING ERRCODE = '23514';
  END IF;
  IF NEW.participant_id IS NOT NULL
     AND (SELECT church_id FROM participants WHERE id = NEW.participant_id) IS DISTINCT FROM NEW.church_id THEN
    RAISE EXCEPTION 'That person is not part of this church.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.group_ids) AS gid
    LEFT JOIN groups g ON g.id = gid
    WHERE g.id IS NULL OR g.church_id <> NEW.church_id
  ) THEN
    RAISE EXCEPTION 'Every group must belong to this church.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER church_invites_consistency
  BEFORE INSERT OR UPDATE ON church_invites
  FOR EACH ROW EXECUTE FUNCTION ec_church_invites_consistency();

ALTER TABLE church_invites ENABLE ROW LEVEL SECURITY;

-- Admins of the church see who has been invited. Every write goes through
-- server actions that check the inviter's role first.
CREATE POLICY "church_invites_read_admins"
  ON church_invites FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

GRANT SELECT ON church_invites TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON church_invites FROM authenticated;
GRANT ALL ON church_invites TO service_role;

-- ── 3. The pipeline, members apart ───────────────────────────

CREATE OR REPLACE FUNCTION ec_connect_pipeline(cid UUID)
RETURNS TABLE (
  participant_id      UUID,
  stage               TEXT,
  flags               TEXT[],
  days_since_signup   INTEGER,
  days_since_contact  INTEGER
)
LANGUAGE sql STABLE
AS $$
  WITH s AS (
    SELECT * FROM ec_church_settings(cid)
  ),
  base AS (
    SELECT
      p.*,
      COALESCE(p.signed_up_at, p.created_at) AS joined_at,
      EXISTS (
        SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.profile_id = p.profile_id AND g.church_id = cid AND g.is_active AND g.kind = 'serve'
      ) AS is_serving,
      EXISTS (
        SELECT 1 FROM group_members gm JOIN groups g ON g.id = gm.group_id
        WHERE gm.profile_id = p.profile_id AND g.church_id = cid AND g.is_active
          AND g.kind NOT IN ('serve', 'roster')
      )
      OR EXISTS (
        SELECT 1 FROM event_rsvps r JOIN events e ON e.id = r.event_id
        WHERE r.profile_id = p.profile_id AND e.church_id = cid
          AND (r.attended_at IS NOT NULL
               OR (r.status = 'going' AND e.status = 'published' AND e.starts_at > NOW() - INTERVAL '30 days'))
      ) AS is_plugged_in,
      p.status = 'completed' OR EXISTS (
        SELECT 1 FROM participant_progress pp
        WHERE pp.participant_id = p.id
          AND (pp.meeting_completed_at IS NOT NULL OR pp.meeting_started_at IS NOT NULL)
      ) AS has_met,
      (p.assigned_connector_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM participant_connectors pc WHERE pc.participant_id = p.id)) AS has_connector
    FROM participants p
    WHERE p.church_id = cid
  ),
  staged AS (
    SELECT
      b.*,
      CASE
        WHEN b.status = 'inactive' THEN 'inactive'
        WHEN b.joined_as = 'member' THEN 'member'
        WHEN b.is_serving THEN 'serving'
        WHEN b.is_plugged_in THEN 'plugged_in'
        WHEN b.has_met THEN 'met'
        WHEN b.last_personal_contact_at IS NOT NULL THEN 'contacted'
        ELSE 'new'
      END AS stage
    FROM base b
  )
  SELECT
    st.id,
    st.stage,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN st.stage = 'member' AND st.member_confirmed_at IS NULL THEN 'confirm_member' END,
      CASE WHEN st.stage NOT IN ('inactive', 'serving', 'member') AND NOT st.has_connector THEN 'unassigned' END,
      CASE WHEN st.stage = 'new'
                AND st.joined_at < NOW() - make_interval(days => (SELECT contact_within_days FROM s))
           THEN 'needs_contact' END,
      CASE WHEN st.stage IN ('contacted', 'met')
                AND GREATEST(st.joined_at, COALESCE(st.last_action_at, st.joined_at),
                             COALESCE(st.last_personal_contact_at, st.joined_at)) < NOW() - INTERVAL '14 days'
           THEN 'stalled' END,
      CASE WHEN st.stage IN ('new', 'contacted', 'met')
                AND st.joined_at < NOW() - make_interval(days => (SELECT plugged_in_within_days FROM s))
           THEN 'needs_table' END
    ], NULL),
    EXTRACT(DAY FROM NOW() - st.joined_at)::int,
    CASE WHEN st.last_personal_contact_at IS NULL THEN NULL
         ELSE EXTRACT(DAY FROM NOW() - st.last_personal_contact_at)::int END
  FROM staged st;
$$;

-- ── 4. Hosting rule v4 ───────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_can_host_events()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.church_id IS NOT NULL
        AND p.host_blocked_at IS NULL
        AND (
          p.role <> 'participant'
          OR p.trusted_host_at IS NOT NULL
          OR (
            EXISTS (
              SELECT 1 FROM participants pa
              WHERE pa.profile_id = p.id
                AND pa.church_id = p.church_id
                AND (
                  pa.status = 'completed'
                  OR (pa.joined_as = 'member' AND pa.member_confirmed_at IS NOT NULL)
                  OR EXISTS (
                    SELECT 1 FROM participant_progress pp
                    WHERE pp.participant_id = pa.id AND pp.meeting_completed_at IS NOT NULL
                  )
                )
            )
            AND ec_host_orientation_done(p.id, p.church_id)
          )
        )
    );
$$;

-- ── 5. Onboarding facts ──────────────────────────────────────

ALTER TABLE churches
  ADD COLUMN service_times TEXT CHECK (service_times IS NULL OR length(service_times) <= 500),
  ADD COLUMN is_test       BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE churches SET is_test = TRUE, listed_on_map = FALSE, verified_at = NULL
WHERE slug = 'test-church';

ALTER TABLE churches
  ADD CONSTRAINT churches_test_never_listed
    CHECK (NOT is_test OR (verified_at IS NULL AND NOT listed_on_map));

ALTER TABLE church_settings
  ADD COLUMN agreement_version     TEXT CHECK (agreement_version IS NULL OR length(agreement_version) <= 40),
  ADD COLUMN agreement_accepted_at TIMESTAMPTZ,
  ADD COLUMN agreement_accepted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
