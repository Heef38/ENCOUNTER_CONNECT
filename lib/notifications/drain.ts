import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from './senders/resend';
import { sendSms } from './senders/twilio';
import type { NotificationOutboxRow } from './types';

export interface DrainReport {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface DrainOptions {
  /** Max rows to process in a single drain. Defaults to 100. */
  limit?: number;
}

/**
 * Pulls outbox rows that are pending and due (`scheduled_for <= now()`),
 * dispatches each to the right provider, and updates status accordingly.
 *
 * Failure handling is conservative: a failed send marks the row `failed`
 * with the provider error in the `error` column. A simple retry strategy
 * (e.g. requeue rows where `status='failed' AND retries < 3`) can be
 * layered on later if needed.
 *
 * Use the service-role client. Outbox is service-role-write only.
 */
export async function drainNotificationOutbox(
  admin: SupabaseClient,
  options: DrainOptions = {},
): Promise<DrainReport> {
  const limit = options.limit ?? 100;
  const report: DrainReport = { scanned: 0, sent: 0, failed: 0, skipped: 0 };

  const { data, error } = await admin
    .from('notification_outbox')
    .select(
      'id, channel, recipient_email, recipient_phone, subject, body, status, scheduled_for',
    )
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Pick<
    NotificationOutboxRow,
    | 'id'
    | 'channel'
    | 'recipient_email'
    | 'recipient_phone'
    | 'subject'
    | 'body'
    | 'status'
    | 'scheduled_for'
  >[];

  for (const row of rows) {
    report.scanned += 1;

    if (row.channel === 'email') {
      if (!row.recipient_email) {
        await admin
          .from('notification_outbox')
          .update({
            status: 'skipped',
            error: 'No recipient_email on row.',
          })
          .eq('id', row.id);
        report.skipped += 1;
        continue;
      }

      const result = await sendEmail({
        to: row.recipient_email,
        subject: row.subject ?? '',
        text: row.body,
      });

      if (result.ok) {
        await admin
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error: null,
            metadata: { provider_id: result.providerId },
          })
          .eq('id', row.id);
        report.sent += 1;
      } else {
        await admin
          .from('notification_outbox')
          .update({ status: 'failed', error: result.error ?? 'unknown error' })
          .eq('id', row.id);
        report.failed += 1;
      }
      continue;
    }

    if (row.channel === 'sms') {
      if (!row.recipient_phone) {
        await admin
          .from('notification_outbox')
          .update({
            status: 'skipped',
            error: 'No recipient_phone on row.',
          })
          .eq('id', row.id);
        report.skipped += 1;
        continue;
      }

      const result = await sendSms({
        to: row.recipient_phone,
        body: row.body,
      });

      if (result.ok) {
        await admin
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error: null,
            metadata: { provider_id: result.providerId },
          })
          .eq('id', row.id);
        report.sent += 1;
      } else {
        await admin
          .from('notification_outbox')
          .update({ status: 'failed', error: result.error ?? 'unknown error' })
          .eq('id', row.id);
        report.failed += 1;
      }
      continue;
    }

    // Unknown channel — mark skipped so it doesn't loop.
    await admin
      .from('notification_outbox')
      .update({ status: 'skipped', error: `Unknown channel: ${row.channel}` })
      .eq('id', row.id);
    report.skipped += 1;
  }

  return report;
}
