-- ============================================================
-- 028_profile_sms_consent.sql
-- Closes a compliance gap that blocks event notifications.
--
-- The problem: SMS consent lives on participants.sms_consent_at
-- (migration 017), and the notification outbox is keyed on
-- participant_id. But EVENT recipients are PROFILES — staff,
-- connectors, group members, and anyone who joined without going
-- through the participant signup form. profiles has had a `phone`
-- column since migration 018 and NO consent column at all.
--
-- Fanning events out over SMS against profiles.phone would text
-- people who never opted in. That is a 10DLC/TCPA problem, not a
-- product wart, so the column lands before any event SMS ships.
--
-- Consent is enforced at ENQUEUE — one chokepoint — by
-- resolveProfileDelivery() in lib/notifications/enqueue.ts, the
-- sibling of the existing resolveParticipantDelivery(). The drain
-- still sends purely off recipient_phone and knows nothing about
-- consent; enqueue is what guarantees a non-consented profile
-- never gets an outbox row.
--
-- NULL sms_consent_at = no consent on file = do not text. Same
-- convention as participants (017).
-- ============================================================

ALTER TABLE profiles ADD COLUMN sms_consent_at     TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN sms_consent_source TEXT;

COMMENT ON COLUMN profiles.sms_consent_at IS
  'When this person opted in to SMS. NULL = no consent on file; do not text. '
  'Enforced at enqueue by resolveProfileDelivery().';

COMMENT ON COLUMN profiles.sms_consent_source IS
  'Where consent was captured: profile_settings | event_rsvp | event_host | '
  'staff_onboarding | web_signup. Kept for audit and dispute handling.';

-- Deliberately NOT backfilled. Existing profiles have never been asked, and
-- inventing consent for them is precisely the thing this migration prevents.
-- Members are prompted in profile settings and on their first RSVP/host.

-- Partial index for the fan-out query: "everyone in this audience we may text".
CREATE INDEX idx_profiles_sms_reachable
  ON profiles(church_id)
  WHERE sms_consent_at IS NOT NULL AND phone IS NOT NULL;

NOTIFY pgrst, 'reload schema';
