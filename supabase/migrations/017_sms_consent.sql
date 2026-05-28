-- Migration 017: SMS opt-in consent tracking
--
-- A2P 10DLC registration requires demonstrable proof of opt-in. The
-- participant's mobile number already lives in `participants.phone`; this
-- adds when and how they consented to receive text messages so we can
-- show carriers/Twilio the web-form opt-in, and so the notification drain
-- can gate SMS sends on the presence of consent.
--
-- `sms_consent_at` NULL means "no SMS consent on file" — do not text them.

ALTER TABLE participants ADD COLUMN sms_consent_at     TIMESTAMPTZ;
ALTER TABLE participants ADD COLUMN sms_consent_source TEXT;

COMMENT ON COLUMN participants.sms_consent_at IS
  'When the participant opted in to SMS. NULL = no consent on file; do not send SMS.';
COMMENT ON COLUMN participants.sms_consent_source IS
  'How consent was captured, e.g. web_signup.';

NOTIFY pgrst, 'reload schema';
