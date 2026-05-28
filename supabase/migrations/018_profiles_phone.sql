-- Migration 018: phone number for staff profiles
--
-- Connectors already have `connectors.phone`, but admins/connectors are
-- EC profiles and we now require a mobile number so notifications (e.g. a
-- text when a participant schedules a meeting) can reach them.

ALTER TABLE profiles ADD COLUMN phone TEXT;

COMMENT ON COLUMN profiles.phone IS
  'Staff mobile number for operational notifications (meeting scheduled, etc.).';

NOTIFY pgrst, 'reload schema'; 
