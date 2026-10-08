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
      'id, church_id, channel, recipient_email, recipient_phone, subject, body, status, scheduled_for, metadata',
    )
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Pick<
    NotificationOutboxRow,
    | 'id'
    | 'church_id'
    | 'metadata'
    | 'channel'
    | 'recipient_email'
    | 'recipient_phone'
    | 'subject'
    | 'body'
    | 'status'
    | 'scheduled_for'
  >[];

  // Texting sender per church (church_settings, migration 032): the
  // platform's number and campaign by default, or the church's own number
  // or Messaging Service when it has registered one under its own brand.
  const senders = new Map<string, { from?: string; messagingServiceSid?: string }>();
  async function senderFor(churchId: string) {
    if (senders.has(churchId)) return senders.get(churchId)!;
    const { data: cs } = await admin
      .from('church_settings')
      .select('sms_sender_mode, sms_from_number, sms_messaging_service_sid')
      .eq('church_id', churchId)
      .maybeSingle();
    const c = cs as { sms_sender_mode: string; sms_from_number: string | null; sms_messaging_service_sid: string | null } | null;
    const sender =
      c?.sms_sender_mode === 'own'
        ? c.sms_messaging_service_sid
          ? { messagingServiceSid: c.sms_messaging_service_sid }
          : c.sms_from_number
            ? { from: c.sms_from_number }
            : {}
        : {};
    senders.set(churchId, sender);
    return sender;
  }

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
            // Merge, never replace: rows carry attribution (event_id,
            // recipient_profile_id, sender_profile_id) that later reads use.
            metadata: { ...(row.metadata ?? {}), provider_id: result.providerId },
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

      const sender = await senderFor(row.church_id);
      const result = await sendSms({
        to: row.recipient_phone,
        body: row.body,
        ...sender,
      });

      if (result.ok) {
        await admin
          .from('notification_outbox')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            error: null,
            // Merge, never replace: rows carry attribution (event_id,
            // recipient_profile_id, sender_profile_id) that later reads use.
            metadata: { ...(row.metadata ?? {}), provider_id: result.providerId },
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
