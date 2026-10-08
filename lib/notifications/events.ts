import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTemplate, render, resolveProfileDelivery } from './enqueue';
import { connectName } from '@/lib/brand';
import { siteUrl } from '@/lib/site';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';

/**
 * Notifications about gatherings, through the existing outbox.
 *
 * Phase-1 scope (rethink §4.12): the two notices people must not miss — a
 * cancellation, and a report an admin has to look at — plus the host
 * relay. Publish fan-out and reminders come later, under the per-host cap.
 *
 * Consent: members are texted only with sms_consent_at and a phone, through
 * resolveProfileDelivery (the single chokepoint); everyone gets email when
 * they have an address. Staff report alerts follow the existing staff
 * operational texting, which uses the number they gave when invited.
 */

interface EventFacts {
  id: string;
  church_id: string;
  title: string;
  starts_at: string;
  timezone: string;
  host_profile_id: string | null;
}

interface ChurchFacts {
  name: string;
  connect_name: string | null;
}

async function loadFacts(admin: SupabaseClient, eventId: string): Promise<{ event: EventFacts; church: ChurchFacts } | null> {
  const { data: event } = await admin
    .from('events')
    .select('id, church_id, title, starts_at, timezone, host_profile_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return null;
  const { data: church } = await admin
    .from('churches')
    .select('name, connect_name')
    .eq('id', (event as EventFacts).church_id)
    .maybeSingle();
  return { event: event as EventFacts, church: (church ?? { name: 'your church', connect_name: null }) as ChurchFacts };
}

function when(e: EventFacts): string {
  return `${formatDateInZone(e.starts_at, e.timezone, { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatTimeInZone(e.starts_at, e.timezone)}`;
}

interface Recipient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sms_consent_at: string | null;
}

/** Everyone who RSVP'd going or maybe, minus whoever cancelled it. */
export async function enqueueEventCancelled(
  admin: SupabaseClient,
  args: { eventId: string; reason: string | null; cancelledBy: string | null },
): Promise<number> {
  const facts = await loadFacts(admin, args.eventId);
  if (!facts) return 0;
  const { event, church } = facts;

  const { data: rsvps } = await admin
    .from('event_rsvps')
    .select('profile_id, profile:profiles ( id, first_name, last_name, email, phone, sms_consent_at )')
    .eq('event_id', event.id)
    .in('status', ['going', 'maybe']);

  const tpl = await loadTemplate(admin, event.church_id, 'event_cancelled_to_rsvps');
  if (!tpl) return 0;

  const baseVars = {
    event_title: event.title,
    event_when: when(event),
    reason_line: args.reason ? ` ${args.reason}` : '',
    event_url: `${siteUrl()}/hub/e/${event.id}`,
    connect_name: connectName(church),
  };

  const rows: Record<string, unknown>[] = [];
  for (const r of (rsvps ?? []) as unknown as Array<{ profile: Recipient | null }>) {
    const p = r.profile;
    if (!p || p.id === args.cancelledBy) continue;
    const vars = { ...baseVars, recipient_first_name: p.first_name ?? '' };

    const email = resolveProfileDelivery('email', p);
    if (email.ok) {
      rows.push({
        church_id: event.church_id,
        template_key: 'event_cancelled_to_rsvps',
        channel: 'email',
        recipient_email: p.email,
        recipient_name: `${p.first_name} ${p.last_name}`.trim() || null,
        subject: tpl.subject ? render(tpl.subject, vars) : null,
        body: render(tpl.body, vars),
        status: 'pending',
        metadata: { trigger: 'event_cancelled', event_id: event.id, recipient_profile_id: p.id },
        idempotency_key: `event_cancelled:${event.id}:${p.id}:email`,
      });
    }
    // A cancelled Thursday home group announced only by email goes unread.
    const sms = resolveProfileDelivery('sms', p);
    if (sms.ok) {
      rows.push({
        church_id: event.church_id,
        template_key: 'event_cancelled_to_rsvps',
        channel: 'sms',
        recipient_phone: sms.recipientPhone,
        recipient_name: `${p.first_name} ${p.last_name}`.trim() || null,
        subject: null,
        body: `${connectName(church)}: ${event.title} on ${when(event)} is cancelled.${args.reason ? ` ${args.reason}` : ''} ${baseVars.event_url} Reply STOP to opt out.`,
        status: 'pending',
        metadata: { trigger: 'event_cancelled', event_id: event.id, recipient_profile_id: p.id },
        idempotency_key: `event_cancelled:${event.id}:${p.id}:sms`,
      });
    }
  }

  if (rows.length > 0) {
    // ignoreDuplicates: a retried cancel must not double-send.
    await admin.from('notification_outbox').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  }
  return rows.length;
}

/** Campus admins and church admins of the gathering's own church. */
export async function enqueueEventReported(
  admin: SupabaseClient,
  args: { eventId: string; reporterName: string; reason: string; hidden: boolean; reportId: string },
): Promise<number> {
  const facts = await loadFacts(admin, args.eventId);
  if (!facts) return 0;
  const { event, church } = facts;

  const { data: admins } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email, phone, sms_consent_at')
    .eq('church_id', event.church_id)
    .in('role', ['church_admin', 'campus_admin']);

  const tpl = await loadTemplate(admin, event.church_id, 'event_reported_to_admin');
  if (!tpl) return 0;

  const baseVars = {
    event_title: event.title,
    event_when: when(event),
    reporter_name: args.reporterName,
    report_reason: args.reason.replace(/_/g, ' '),
    hidden_line: args.hidden ? ' It has been taken off the hub until someone reviews it.' : ' It is still up.',
    review_url: `${siteUrl()}/hub/review`,
    connect_name: connectName(church),
  };

  const rows: Record<string, unknown>[] = [];
  for (const p of (admins ?? []) as Recipient[]) {
    const vars = { ...baseVars, recipient_first_name: p.first_name ?? '' };
    if (p.email) {
      rows.push({
        church_id: event.church_id,
        template_key: 'event_reported_to_admin',
        channel: 'email',
        recipient_email: p.email,
        recipient_name: `${p.first_name} ${p.last_name}`.trim() || null,
        subject: tpl.subject ? render(tpl.subject, vars) : null,
        body: render(tpl.body, vars),
        status: 'pending',
        metadata: { trigger: 'event_reported', event_id: event.id, report_id: args.reportId, recipient_profile_id: p.id },
        idempotency_key: `event_reported:${args.reportId}:${p.id}:email`,
      });
    }
    // "A report hides the event and texts an admin" (locked 2026-08-17).
    if (p.phone) {
      rows.push({
        church_id: event.church_id,
        template_key: 'event_reported_to_admin',
        channel: 'sms',
        recipient_phone: p.phone,
        recipient_name: `${p.first_name} ${p.last_name}`.trim() || null,
        subject: null,
        body: `${connectName(church)}: "${event.title}" was reported (${baseVars.report_reason}).${args.hidden ? ' It is off the hub until reviewed.' : ''} ${baseVars.review_url}`,
        status: 'pending',
        metadata: { trigger: 'event_reported', event_id: event.id, report_id: args.reportId, recipient_profile_id: p.id },
        idempotency_key: `event_reported:${args.reportId}:${p.id}:sms`,
      });
    }
  }
  if (rows.length > 0) {
    await admin.from('notification_outbox').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  }
  return rows.length;
}

/**
 * Relays a member's message to the host by email. The host learns the
 * sender's name and email (the sender chose to write); the sender never
 * learns the host's contact details.
 */
export async function enqueueMessageToHost(
  admin: SupabaseClient,
  args: { eventId: string; sender: { id: string; name: string; email: string | null }; message: string },
): Promise<boolean> {
  const facts = await loadFacts(admin, args.eventId);
  if (!facts || !facts.event.host_profile_id) return false;
  const { event, church } = facts;

  const { data: host } = await admin
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('id', event.host_profile_id)
    .maybeSingle();
  const h = host as { id: string; first_name: string; last_name: string; email: string | null } | null;
  if (!h?.email) return false;

  const tpl = await loadTemplate(admin, event.church_id, 'event_message_to_host');
  if (!tpl) return false;

  const vars = {
    recipient_first_name: h.first_name ?? '',
    sender_name: args.sender.name,
    sender_email: args.sender.email ?? '(no email on file)',
    message: args.message,
    event_title: event.title,
    event_when: when(event),
    connect_name: connectName(church),
  };

  const { error } = await admin.from('notification_outbox').insert({
    church_id: event.church_id,
    template_key: 'event_message_to_host',
    channel: 'email',
    recipient_email: h.email,
    recipient_name: `${h.first_name} ${h.last_name}`.trim() || null,
    subject: tpl.subject ? render(tpl.subject, vars) : null,
    body: render(tpl.body, vars),
    status: 'pending',
    metadata: { trigger: 'message_host', event_id: event.id, sender_profile_id: args.sender.id, recipient_profile_id: h.id },
  });
  return !error;
}
