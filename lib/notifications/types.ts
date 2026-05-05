export type NotificationChannel = 'email' | 'sms';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * Stable keys the app looks up when enqueueing notifications. Churches
 * can customize the body for any of these by inserting a matching row
 * into notification_templates.
 */
export type NotificationTemplateKey =
  | 'step_complete_to_connector'
  | 'step_stale_3_day'
  | 'step_stale_7_day'
  | 'meeting_scheduled_to_connector'
  | 'meeting_scheduled_to_participant'
  | 'meeting_confirmed_to_participant'
  | 'meeting_declined_to_participant';

export interface NotificationTemplate {
  id: string;
  church_id: string;
  key: string;
  name: string;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationOutboxRow {
  id: string;
  church_id: string;
  participant_id: string | null;
  step_id: string | null;
  template_key: string | null;
  channel: NotificationChannel;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  scheduled_for: string;
  sent_at: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}
