// ============================================================
// SCHEDULING CORE — Reminder Processor Service
// REUSABLE CORE
//
// Designed to be called by a cron job / edge function / route handler.
// Processes all pending reminders whose scheduled_for <= now.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getNotificationAdapter } from '../adapters/notification-adapter';
import type { ServiceResult } from '../types';

export interface ProcessRemindersResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

/**
 * Process all pending reminders that are due.
 * Call this from a cron route (e.g. /api/scheduling/process-reminders)
 * or a Supabase Edge Function on a schedule.
 */
export async function processDueReminders(
  supabase: SupabaseClient
): Promise<ServiceResult<ProcessRemindersResult>> {
  const now = new Date().toISOString();

  // Fetch due reminders with booking + attendee data
  const { data: reminders, error: fetchErr } = await supabase
    .from('scheduling_reminders')
    .select(`
      *,
      booking:scheduling_bookings(
        id, title, starts_at, ends_at, timezone, status,
        appointment_type:scheduling_appointment_types(name, location_mode),
        attendees:scheduling_booking_attendees(display_name, email, phone, role)
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .limit(50); // process in batches

  if (fetchErr) return { success: false, error: fetchErr.message };

  const adapter = getNotificationAdapter();
  const result: ProcessRemindersResult = { processed: 0, succeeded: 0, failed: 0, errors: [] };

  for (const reminder of reminders ?? []) {
    result.processed++;
    const booking = reminder.booking;
    if (!booking || ['cancelled', 'rescheduled'].includes(booking.status)) {
      // Skip — mark as cancelled
      await supabase
        .from('scheduling_reminders')
        .update({ status: 'skipped' })
        .eq('id', reminder.id);
      continue;
    }

    const recipient = reminder.recipient ?? primaryAttendeeContact(booking.attendees, reminder.channel);
    if (!recipient) {
      await supabase
        .from('scheduling_reminders')
        .update({ status: 'skipped' })
        .eq('id', reminder.id);
      continue;
    }

    const payload = buildReminderPayload(booking, recipient, reminder.channel);

    let sendResult;
    try {
      sendResult = reminder.channel === 'sms'
        ? await adapter.sendSms(payload)
        : await adapter.sendEmail(payload);
    } catch (err) {
      sendResult = { success: false, error: String(err) };
    }

    // Update reminder status
    await supabase
      .from('scheduling_reminders')
      .update({
        status:  sendResult.success ? 'sent' : 'failed',
        sent_at: sendResult.success ? now : null,
      })
      .eq('id', reminder.id);

    // Write to notification log
    await supabase.from('scheduling_notification_log').insert({
      reminder_id:  reminder.id,
      booking_id:   booking.id,
      channel:      reminder.channel,
      recipient,
      subject:      payload.subject ?? null,
      body_preview: payload.body.slice(0, 200),
      status:       sendResult.success ? 'sent' : 'failed',
      provider:     'console', // update when wiring a real provider
      provider_ref: sendResult.provider_ref ?? null,
      error_detail: sendResult.error ?? null,
    });

    if (sendResult.success) result.succeeded++;
    else {
      result.failed++;
      result.errors.push(`reminder ${reminder.id}: ${sendResult.error}`);
    }
  }

  return { success: true, data: result };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function primaryAttendeeContact(
  attendees: { role: string; email?: string | null; phone?: string | null }[] | null,
  channel: string
): string | null {
  const primary = attendees?.find((a) => a.role === 'primary') ?? attendees?.[0];
  if (!primary) return null;
  if (channel === 'sms')   return primary.phone ?? null;
  return primary.email ?? null;
}

function buildReminderPayload(
  booking: {
    id: string;
    title: string | null;
    starts_at: string;
    appointment_type?: { name: string; location_mode: string } | null;
  },
  recipient: string,
  channel: string
) {
  const apptName = booking.title ?? booking.appointment_type?.name ?? 'Appointment';
  const dateStr  = new Date(booking.starts_at).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const subject = `Reminder: ${apptName} — ${dateStr}`;
  const body = channel === 'sms'
    ? `Reminder: Your ${apptName} is on ${dateStr}. Reply STOP to opt out.`
    : [
        `This is a reminder for your upcoming appointment.`,
        ``,
        `  Appointment: ${apptName}`,
        `  Date/Time:   ${dateStr}`,
        ``,
        `If you need to cancel or reschedule, please contact us in advance.`,
      ].join('\n');

  return { to: recipient, subject, body };
}
