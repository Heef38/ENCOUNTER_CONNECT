-- Migration 024: per-church notification settings
--
-- Adds a single-row-per-church settings record that the notification layer
-- reads to decide (a) whether each notification type is enabled and (b) the
-- cadence of the scheduled reminder sweeps. Every column defaults to today's
-- behavior, so a church with NO row behaves exactly as before — rows are
-- created lazily the first time an admin saves settings.
--
-- Event-driven notifications (step complete, meeting scheduled/decision/notes)
-- are instant, so only their on/off flag is configurable. The stale-step and
-- connector-availability sweeps additionally expose day cadences.

CREATE TABLE notification_settings (
  church_id UUID PRIMARY KEY REFERENCES churches(id) ON DELETE CASCADE,

  -- On/off per notification type.
  step_complete_to_connector_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  meeting_scheduled_enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  meeting_decision_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  meeting_notes_enabled                BOOLEAN NOT NULL DEFAULT TRUE,
  stale_reminders_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  availability_reminders_enabled       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Cadences (days). Enforced >= 1 in the app layer.
  stale_first_reminder_days            INT NOT NULL DEFAULT 3,
  stale_second_reminder_days           INT NOT NULL DEFAULT 7,
  availability_reminder_horizon_days   INT NOT NULL DEFAULT 14,
  availability_reminder_interval_days  INT NOT NULL DEFAULT 7,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- Mirrors notification_templates (013): staff in the church read; campus
-- admin+ write. Writes also happen via service-role, which bypasses RLS.

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_settings_read_staff"
  ON notification_settings FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

CREATE POLICY "notification_settings_write_admin"
  ON notification_settings FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );
