-- Migration 013: notifications (templates + outbox)
--
-- Adds the data model for email + SMS notifications. This migration only
-- introduces the storage layer and queue. Actual sending (Resend / Twilio
-- adapters) is wired up separately when provider credentials land.
--
-- Key decisions:
-- 1. Templates are church-scoped. Each is keyed by a stable string the app
--    uses to look up the right template (e.g. 'step_complete_to_connector').
--    Hardcoded fallback bodies live in lib/notifications/enqueue.ts so the
--    system works even when no template has been customized.
-- 2. The outbox is the queue. Every notification the app intends to send
--    becomes an outbox row with status='pending'. A worker (cron-driven
--    or push-on-write) drains the outbox via Resend / Twilio later.
-- 3. Idempotency for the stale-reminder sweep: each row carries an optional
--    idempotency_key (unique). Stale-sweep code computes a key like
--    "stale:<participant_id>:<step_id>:3d" so re-running the sweep doesn't
--    double-send.

CREATE TYPE ec_notification_channel AS ENUM ('email', 'sms');
CREATE TYPE ec_notification_status  AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- ── Templates ────────────────────────────────────────────────

CREATE TABLE notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  name        TEXT NOT NULL,
  channel     ec_notification_channel NOT NULL,
  subject     TEXT,
  body        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, key)
);

CREATE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_notification_templates_church ON notification_templates(church_id);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read_staff"
  ON notification_templates FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('connector'))
  );

CREATE POLICY "templates_write_admin"
  ON notification_templates FOR ALL TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  )
  WITH CHECK (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- ── Outbox ───────────────────────────────────────────────────

CREATE TABLE notification_outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  participant_id   UUID REFERENCES participants(id) ON DELETE SET NULL,
  step_id          UUID REFERENCES flow_steps(id) ON DELETE SET NULL,
  template_key     TEXT,
  channel          ec_notification_channel NOT NULL,
  recipient_email  TEXT,
  recipient_phone  TEXT,
  recipient_name   TEXT,
  subject          TEXT,
  body             TEXT NOT NULL,
  status           ec_notification_status NOT NULL DEFAULT 'pending',
  scheduled_for    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE TRIGGER notification_outbox_updated_at
  BEFORE UPDATE ON notification_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_outbox_church_status_due
  ON notification_outbox(church_id, status, scheduled_for);
CREATE INDEX idx_outbox_participant
  ON notification_outbox(participant_id);

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;

-- Read: campus admin+. The outbox can contain participant data in render
-- snapshots so we don't expose it to plain connectors.
CREATE POLICY "outbox_read_admin"
  ON notification_outbox FOR SELECT TO authenticated
  USING (
    ec_is_platform_admin()
    OR (church_id = ec_current_church_id() AND ec_has_role('campus_admin'))
  );

-- Writes only happen via service-role; no policy needed for that.
