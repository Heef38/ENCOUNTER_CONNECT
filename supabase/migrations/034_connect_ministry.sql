-- ============================================================
-- 034_connect_ministry.sql
--
-- The admin's Monday (rethink §4.4, §4.5, §6, slice 2):
--
--   1. participant_touches: a contact log that mostly writes itself.
--      A booked or held first meeting counts as contact automatically, and
--      so does every message actually sent to a newcomer; "Log a contact"
--      is the one tap for the personal call. last_contacted_at ("last heard
--      from us") and last_personal_contact_at (a person reached out) are
--      kept on participants by trigger.
--   2. ec_connect_pipeline(church): each newcomer's stage
--      (new / contacted / met / plugged_in / serving / inactive) derived
--      from facts, with flags for the console, the digest and the nudges.
--      participants.status was never a reliable stage: app code only ever
--      wrote new, connected and completed.
--   3. Learn: lessons get a purpose, a summary, a length and an optional
--      group audience; lesson_completions records who finished what; three
--      training lessons are seeded per church.
--   4. Hosting (answer to §12 Q4): a member hosts once their first meeting
--      is complete at this church and they have done the host orientation;
--      admins can mark anyone a trusted host.
-- ============================================================

-- ── 1. Contact log ───────────────────────────────────────────

CREATE TABLE participant_touches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id             UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  participant_id        UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN (
                          'call', 'text', 'email', 'in_person', 'note',
                          'meeting_booked', 'meeting_held', 'message_sent')),
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  summary               TEXT CHECK (summary IS NULL OR length(summary) <= 2000),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Idempotency for touches the database writes itself.
  system_ref            TEXT UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_touches_participant ON participant_touches(participant_id, occurred_at DESC);
CREATE INDEX idx_touches_church ON participant_touches(church_id, occurred_at DESC);

ALTER TABLE participants
  ADD COLUMN last_contacted_at        TIMESTAMPTZ,
  ADD COLUMN last_personal_contact_at TIMESTAMPTZ;

COMMENT ON COLUMN participants.last_contacted_at IS
  'Last time anything reached this person: a logged contact, a meeting, or a message sent.';
COMMENT ON COLUMN participants.last_personal_contact_at IS
  'Last time a person reached out: a logged contact, or a first meeting booked or held.';

-- A touch always belongs to its participant's church, whatever the caller sent.
CREATE OR REPLACE FUNCTION ec_touch_set_church()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SELECT church_id INTO NEW.church_id FROM participants WHERE id = NEW.participant_id;
  IF NEW.church_id IS NULL THEN
    RAISE EXCEPTION 'Participant not found.' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER participant_touches_set_church
  BEFORE INSERT OR UPDATE OF participant_id ON participant_touches
  FOR EACH ROW EXECUTE FUNCTION ec_touch_set_church();

CREATE OR REPLACE FUNCTION ec_touch_updates_participant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  personal BOOLEAN := NEW.source = 'manual' OR NEW.kind IN ('meeting_booked', 'meeting_held');
BEGIN
  UPDATE participants SET
    last_contacted_at = GREATEST(COALESCE(last_contacted_at, NEW.occurred_at), NEW.occurred_at),
    last_personal_contact_at = CASE
      WHEN personal THEN GREATEST(COALESCE(last_personal_contact_at, NEW.occurred_at), NEW.occurred_at)
      ELSE last_personal_contact_at END
  WHERE id = NEW.participant_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER participant_touches_update_participant
  AFTER INSERT ON participant_touches
  FOR EACH ROW EXECUTE FUNCTION ec_touch_updates_participant();

-- System touches from the journey: a first meeting booked, then held.
CREATE OR REPLACE FUNCTION ec_progress_writes_touches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.scheduled_event_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.scheduled_event_id IS DISTINCT FROM NEW.scheduled_event_id) THEN
    INSERT INTO participant_touches (participant_id, church_id, kind, source, system_ref)
    VALUES (NEW.participant_id, '00000000-0000-0000-0000-000000000000', 'meeting_booked', 'system',
            'booking:' || NEW.scheduled_event_id)
    ON CONFLICT (system_ref) DO NOTHING;
  END IF;

  IF (NEW.meeting_started_at IS NOT NULL OR NEW.meeting_completed_at IS NOT NULL)
     AND (TG_OP = 'INSERT'
          OR (OLD.meeting_started_at IS NULL AND OLD.meeting_completed_at IS NULL)) THEN
    INSERT INTO participant_touches (participant_id, church_id, kind, source, system_ref, occurred_at)
    VALUES (NEW.participant_id, '00000000-0000-0000-0000-000000000000', 'meeting_held', 'system',
            'meeting:' || NEW.id, COALESCE(NEW.meeting_started_at, NEW.meeting_completed_at))
    ON CONFLICT (system_ref) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER participant_progress_writes_touches
  AFTER INSERT OR UPDATE OF scheduled_event_id, meeting_started_at, meeting_completed_at
  ON participant_progress
  FOR EACH ROW EXECUTE FUNCTION ec_progress_writes_touches();

-- System touches from the outbox: a message actually sent to a newcomer.
CREATE OR REPLACE FUNCTION ec_outbox_writes_touches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' AND NEW.participant_id IS NOT NULL
     AND NEW.template_key IN (
       'meeting_scheduled_to_participant', 'meeting_confirmed_to_participant',
       'meeting_declined_to_participant', 'meeting_notes_to_participant') THEN
    INSERT INTO participant_touches (participant_id, church_id, kind, source, system_ref, occurred_at, summary)
    VALUES (NEW.participant_id, NEW.church_id, 'message_sent', 'system', 'outbox:' || NEW.id,
            COALESCE(NEW.sent_at, NOW()), NEW.subject)
    ON CONFLICT (system_ref) DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER notification_outbox_writes_touches
  AFTER UPDATE OF status ON notification_outbox
  FOR EACH ROW EXECUTE FUNCTION ec_outbox_writes_touches();

-- Contact notes can be pastoral: staff of the church only. Members never
-- read their own log; it is the ministry's record, not a message thread.
ALTER TABLE participant_touches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "touches_read_staff"
  ON participant_touches FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

CREATE POLICY "touches_insert_staff"
  ON participant_touches FOR INSERT TO authenticated
  WITH CHECK (
    source = 'manual'
    AND system_ref IS NULL
    AND created_by_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM participants p
      WHERE p.id = participant_touches.participant_id
        AND (ec_is_platform_admin() OR (p.church_id = ec_current_church_id() AND ec_has_role('connector')))
    )
  );

CREATE POLICY "touches_edit_own_or_admin"
  ON participant_touches FOR UPDATE TO authenticated
  USING (
    source = 'manual' AND (
      created_by_profile_id = auth.uid()
      OR ec_is_platform_admin()
      OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
    )
  )
  WITH CHECK (source = 'manual' AND system_ref IS NULL);

CREATE POLICY "touches_delete_own_or_admin"
  ON participant_touches FOR DELETE TO authenticated
  USING (
    source = 'manual' AND (
      created_by_profile_id = auth.uid()
      OR ec_is_platform_admin()
      OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
    )
  );

-- ── 2. The derived pipeline ──────────────────────────────────
-- SECURITY INVOKER on purpose: it reads participants, progress, groups and
-- RSVPs through the caller's RLS, so only the church's staff get rows.
-- (The digest and nudge sweeps run it as the service role.)

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
      CASE WHEN st.stage NOT IN ('inactive', 'serving') AND NOT st.has_connector THEN 'unassigned' END,
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

COMMENT ON FUNCTION ec_connect_pipeline(UUID) IS
  'Each newcomer''s stage and flags, derived from facts. One rule for the '
  'This week console, the Monday digest, and the contact nudges.';

-- ── 3. Learn ─────────────────────────────────────────────────

ALTER TABLE lessons
  ADD COLUMN purpose TEXT NOT NULL DEFAULT 'general'
    CHECK (purpose IN ('general', 'host_orientation', 'connector', 'leader', 'journey')),
  ADD COLUMN summary TEXT,
  ADD COLUMN minutes INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 240),
  ADD COLUMN audience_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  -- In the Learn library (vs. only inside a journey step).
  ADD COLUMN in_library BOOLEAN NOT NULL DEFAULT TRUE;

-- Lessons that already exist are journey videos (Encounter's video
-- journey); they stay in the journey and out of the library until an
-- admin puts them there.
UPDATE lessons SET purpose = 'journey', in_library = FALSE;

-- Members read published lessons for everyone, or for a group they are in;
-- staff read everything, drafts included.
DROP POLICY IF EXISTS "lessons_read_own_church" ON lessons;
CREATE POLICY "lessons_read_own_church"
  ON lessons FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (
      church_id = ec_current_church_id()
      AND (
        ec_has_role('connector')
        OR (is_published AND (audience_group_id IS NULL OR ec_is_group_member(audience_group_id)))
      )
    )
  );

CREATE TABLE lesson_completions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, profile_id)
);

CREATE INDEX idx_lesson_completions_profile ON lesson_completions(profile_id);

ALTER TABLE lesson_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_completions_read"
  ON lesson_completions FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR ec_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.id = lesson_completions.lesson_id
        AND l.church_id = ec_current_church_id() AND ec_has_role('connector')
    )
  );

-- You mark your own, and only lessons you can read.
CREATE POLICY "lesson_completions_write_own"
  ON lesson_completions FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_completions.lesson_id)
  );

CREATE OR REPLACE FUNCTION ec_seed_training_lessons(cid UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO lessons (church_id, title, slug, summary, minutes, purpose, in_library, is_published, order_index, body)
  VALUES
  (cid, 'How to host a gathering well', 'host-orientation',
   'Five minutes before you open your door: how to welcome people, keep it safe, and use the hub.',
   5, 'host_orientation', TRUE, TRUE, 0,
$body$Hosting is one of the simplest ways to love people: you open a door and make room at a table. Here is what makes a gathering good, and what keeps it safe.

Before
- Pick a time and say how long it lasts. People relax when they know when it ends.
- Choose who it is for. Private gatherings reach only the groups you pick. A home is never shown on a map, and its address goes only to people who say they are going.
- Keep phone numbers and addresses out of the title and description. Everyone who can see the gathering can read them.

When people arrive
- Greet each person by name. Learn one new name every time.
- Notice who is new and introduce them to someone. Nobody should stand alone.
- Keep the welcome short and the conversation open. You are a host, not a teacher.

Keeping it safe
- Gatherings with students or kids need a staff host and stay private. If minors come, two adults are always present.
- If something feels wrong, end the gathering and tell your church. You can also report a gathering from its page.
- Never share someone else's contact details. People can message you through the app.

After
- Check people in on the gathering's page. It tells your church who came, which is how newcomers get followed up.
- If someone new came, tell your church's connect team.
- Cancel through the app if plans change. Everyone who RSVP'd hears right away.

Thank you for opening your door.$body$),
  (cid, 'Being a connector', 'being-a-connector',
   'What a connector does in someone''s first weeks, and how to keep it personal.',
   8, 'connector', TRUE, TRUE, 1,
$body$A connector is the first real person a newcomer gets to know. Your job is simple: make sure nobody walks in alone and nobody falls through the cracks.

The first week
- Reach out within a few days of someone signing up. A short text or call is enough: "I'm glad you came. Can I buy you a coffee?"
- Log the contact in the app with one tap. If you don't, your church can't tell you already reached out, and someone else may chase the same person.

The first meeting
- Listen more than you talk. Ask how they came, what they are looking for, and what their week looks like.
- Bring the prep notes the app gives you, but do not read from them.
- Before you leave, offer one concrete next step: a home group, a gathering this week, a team to serve on.

After
- Write a few honest notes. They help whoever walks with this person next.
- Introduce them to a group leader by name, not just a link.
- Check in again in a couple of weeks. People stay where they are known.

You do not have to have the answers. You only have to show up.$body$),
  (cid, 'Leading a small group', 'leading-a-small-group',
   'How to run a home group people want to come back to.',
   10, 'leader', TRUE, TRUE, 2,
$body$A small group is where people move from attending to belonging. Leading one well is mostly about attention and rhythm.

Rhythm
- Meet at the same time and place. Put the weeks on the calendar once and let the app repeat them.
- Start and end on time. Respect for people's evenings is respect for people.

The room
- Know everyone's name and something about their week.
- Make space for the quiet ones. Ask them directly, kindly.
- Share leadership early: someone to bring food, someone to pray, someone to host next month.

Your roster
- Keep your group's roster current in the app. It decides who can see your private gatherings and get the address, so an accurate roster keeps your home private.
- Add people by their email. Remove people who have moved on.

When someone is struggling
- Listen, pray, and tell your pastor. You are not on your own and you are not their counselor.

Groups grow when leaders make room. When yours gets full, raise up the next leader.$body$)
  ON CONFLICT (church_id, slug) DO NOTHING;
$$;

SELECT ec_seed_training_lessons(id) FROM churches;

-- New churches get them too (extends migration 032's trigger function).
CREATE OR REPLACE FUNCTION ec_on_church_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO church_settings (church_id) VALUES (NEW.id)
  ON CONFLICT (church_id) DO NOTHING;
  PERFORM ec_seed_event_types(NEW.id);
  PERFORM ec_seed_training_lessons(NEW.id);
  RETURN NEW;
END;
$$;

-- ── 4. Hosting ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_host_orientation_done(pid UUID, cid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    NOT (SELECT require_host_orientation FROM ec_church_settings(cid))
    OR NOT EXISTS (
      SELECT 1 FROM lessons
      WHERE church_id = cid AND purpose = 'host_orientation' AND is_published
    )
    OR EXISTS (
      SELECT 1 FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.profile_id = pid AND l.church_id = cid AND l.purpose = 'host_orientation'
    );
$$;

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

-- ── API grants ───────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON participant_touches, lesson_completions TO authenticated;
GRANT ALL ON participant_touches, lesson_completions TO service_role;
GRANT EXECUTE ON FUNCTION
  ec_connect_pipeline(UUID), ec_host_orientation_done(UUID, UUID),
  ec_can_host_events(), ec_seed_training_lessons(UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
