import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationChannel,
  NotificationTemplate,
  NotificationTemplateKey,
} from './types';
import { getNotificationSettings, type NotificationSettings } from './settings';
import { getActiveTeamsForConnectors } from '@/lib/connector-teams/queries';

/**
 * Hardcoded fallback templates used when a church hasn't customized the
 * given key yet. Bodies use {{placeholder}} syntax that's substituted at
 * enqueue time.
 */
const DEFAULT_TEMPLATES: Record<
  NotificationTemplateKey,
  { channel: NotificationChannel; subject: string | null; body: string }
> = {
  step_complete_to_connector: {
    channel: 'email',
    subject: '{{participant_name}} completed: {{step_title}}',
    body:
      'Hi {{recipient_first_name}},\n\n' +
      '{{participant_name}} just completed the step "{{step_title}}" on their journey.\n' +
      "They're ready for the next step. Open Encounter Connect to follow up.\n\n" +
      '— Encounter Connect',
  },
  step_stale_3_day: {
    channel: 'email',
    subject: 'Pick up where you left off',
    body:
      'Hi {{participant_first_name}},\n\n' +
      'You started "{{step_title}}" a few days ago. Whenever you have a moment, ' +
      'open Encounter Connect and continue your journey.\n\n' +
      '— Encounter Connect',
  },
  step_stale_7_day: {
    channel: 'email',
    subject: 'Still here when you are',
    body:
      'Hi {{participant_first_name}},\n\n' +
      "It's been a week since you started \"{{step_title}}\". No pressure — your " +
      'journey is yours. When you\'re ready, your next step is waiting.\n\n' +
      '— Encounter Connect',
  },
  meeting_scheduled_to_connector: {
    channel: 'email',
    subject: 'New meeting: {{participant_name}} on {{meeting_when}}',
    body:
      'Hi {{recipient_first_name}},\n\n' +
      '{{participant_name}} just scheduled a meeting with you for {{meeting_when}}.\n' +
      'Open Encounter Connect to see their journey + 1:1 prep notes before you meet.\n\n' +
      '— Encounter Connect',
  },
  meeting_scheduled_to_participant: {
    channel: 'email',
    subject: 'Your meeting is set for {{meeting_when}}',
    body:
      'Hi {{participant_first_name}},\n\n' +
      'Your meeting with {{connector_name}} is scheduled for {{meeting_when}}.\n' +
      "We'll send you a reminder beforehand. Looking forward to it.\n\n" +
      '— Encounter Connect',
  },
  meeting_confirmed_to_participant: {
    channel: 'email',
    subject: '{{connector_name}} confirmed your meeting',
    body:
      'Hi {{participant_first_name}},\n\n' +
      '{{connector_name}} confirmed your meeting on {{meeting_when}}. See you then.\n\n' +
      '— Encounter Connect',
  },
  meeting_declined_to_participant: {
    channel: 'email',
    subject: 'Meeting time needs a reschedule',
    body:
      'Hi {{participant_first_name}},\n\n' +
      "{{connector_name}} can\'t make the time you picked ({{meeting_when}}). " +
      "Open Encounter Connect to choose a different slot — we\'ll match you with whoever\'s free.\n\n" +
      '— Encounter Connect',
  },
  connector_availability_reminder: {
    channel: 'email',
    subject: 'Add your availability so people can book with you',
    body:
      'Hi {{recipient_first_name}},\n\n' +
      'You don\'t have any availability set for the next {{horizon_days}} days, so ' +
      'participants can\'t book a meeting with you right now.\n' +
      'Open Encounter Connect and add the times you\'re free to meet.\n\n' +
      '— Encounter Connect',
  },
};

function render(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = vars[key];
    return v == null ? '' : v;
  });
}

async function loadTemplate(
  admin: SupabaseClient,
  churchId: string,
  key: NotificationTemplateKey,
): Promise<{
  channel: NotificationChannel;
  subject: string | null;
  body: string;
} | null> {
  const { data } = await admin
    .from('notification_templates')
    .select('channel, subject, body, is_active')
    .eq('church_id', churchId)
    .eq('key', key)
    .maybeSingle();

  if (data && (data as NotificationTemplate).is_active !== false) {
    return {
      channel: (data as NotificationTemplate).channel,
      subject: (data as NotificationTemplate).subject ?? null,
      body: (data as NotificationTemplate).body,
    };
  }
  return DEFAULT_TEMPLATES[key];
}

interface ParticipantContext {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  church_id: string;
  assigned_connector_id: string | null;
  current_step_id: string | null;
  sms_consent_at: string | null;
}

/**
 * Single enforcement point for participant SMS consent. A participant-facing
 * message may only go out by SMS when the participant has opted in
 * (`sms_consent_at` set) AND has a number on file. Returns `ok: false` to
 * tell the caller to skip enqueuing the row entirely, so we never create an
 * outbox row that would text someone who didn't consent.
 */
function resolveParticipantDelivery(
  channel: NotificationChannel,
  participant: { email: string | null; phone: string | null; sms_consent_at: string | null },
): { ok: boolean; recipientPhone: string | null } {
  if (channel === 'sms') {
    if (participant.sms_consent_at && participant.phone) {
      return { ok: true, recipientPhone: participant.phone };
    }
    return { ok: false, recipientPhone: null };
  }
  // Email (the default for any non-SMS channel) just needs an address.
  return { ok: Boolean(participant.email), recipientPhone: null };
}

interface ConnectorContact {
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Enqueues "step complete → notify connector" emails. Called by
 * completeStepAndAdvance when a step is marked done.
 */
export async function enqueueStepCompletionNotice(
  admin: SupabaseClient,
  participantId: string,
  stepId: string,
): Promise<void> {
  const { data: participantRow } = await admin
    .from('participants')
    .select(
      'id, first_name, last_name, email, phone, church_id, assigned_connector_id, current_step_id, sms_consent_at',
    )
    .eq('id', participantId)
    .maybeSingle();

  const participant = participantRow as ParticipantContext | null;
  if (!participant) return;
  if (!participant.assigned_connector_id) return; // no one to notify

  const settings = await getNotificationSettings(admin, participant.church_id);
  if (!settings.step_complete_to_connector_enabled) return;

  const [stepResult, connectorResult] = await Promise.all([
    admin
      .from('flow_steps')
      .select('title')
      .eq('id', stepId)
      .maybeSingle(),
    admin
      .from('connectors')
      .select('profile:profiles!connectors_profile_id_fkey(first_name, last_name, email)')
      .eq('id', participant.assigned_connector_id)
      .maybeSingle(),
  ]);

  const stepTitle = (stepResult.data as { title: string } | null)?.title ?? 'a step';
  const connectorProfile =
    (connectorResult.data as { profile: ConnectorContact | null } | null)?.profile ?? null;

  if (!connectorProfile?.email) return; // can't email without an address

  const template = await loadTemplate(
    admin,
    participant.church_id,
    'step_complete_to_connector',
  );
  if (!template) return;

  const vars: Record<string, string> = {
    participant_name: `${participant.first_name} ${participant.last_name}`.trim(),
    participant_first_name: participant.first_name,
    step_title: stepTitle,
    recipient_first_name: connectorProfile.first_name ?? '',
    recipient_last_name: connectorProfile.last_name ?? '',
  };

  await admin.from('notification_outbox').insert({
    church_id: participant.church_id,
    participant_id: participant.id,
    step_id: stepId,
    template_key: 'step_complete_to_connector',
    channel: template.channel,
    recipient_email: connectorProfile.email,
    recipient_phone: null,
    recipient_name:
      [connectorProfile.first_name, connectorProfile.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || null,
    subject: template.subject ? render(template.subject, vars) : null,
    body: render(template.body, vars),
    status: 'pending',
    metadata: { trigger: 'step_complete' },
  });
}

/**
 * Enqueues notifications when a meeting is booked between a participant
 * and a connector. Sends one to each by default; either side can be
 * skipped via the options. Best-effort — errors are swallowed at the
 * caller (booking creation must not be blocked by notification failures).
 */
export async function enqueueMeetingScheduled(
  admin: SupabaseClient,
  args: {
    participantId: string;
    /** Every connector on the meeting. A team has 2; a solo connector has 1. */
    connectorIds: string[];
    bookingId: string;
    startsAt: Date;
    notifyConnector?: boolean;
    notifyParticipant?: boolean;
  },
): Promise<void> {
  const notifyConnector = args.notifyConnector ?? true;
  const notifyParticipant = args.notifyParticipant ?? true;
  if (!notifyConnector && !notifyParticipant) return;

  const [participantResult, connectorsResult] = await Promise.all([
    admin
      .from('participants')
      .select('id, first_name, last_name, email, phone, church_id, sms_consent_at')
      .eq('id', args.participantId)
      .maybeSingle(),
    admin
      .from('connectors')
      .select(
        'id, profile:profiles!connectors_profile_id_fkey(first_name, last_name, email, phone)',
      )
      .in('id', args.connectorIds),
  ]);

  const participant = participantResult.data as ParticipantContext | null;
  if (!participant) return;

  const settings = await getNotificationSettings(admin, participant.church_id);
  if (!settings.meeting_scheduled_enabled) return;

  const connectorProfiles = (
    (connectorsResult.data ?? []) as unknown as Array<{ profile: ConnectorContact | null }>
  )
    .map((c) => c.profile)
    .filter((p): p is ConnectorContact => p != null);

  // Participant-facing copy names every connector ("Alice & Bob").
  const connectorNames = connectorProfiles
    .map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
    .filter(Boolean);
  const connectorName = connectorNames.length ? connectorNames.join(' & ') : 'your connector';
  const participantName = `${participant.first_name} ${participant.last_name}`.trim();
  const meetingWhen = args.startsAt.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const baseVars: Record<string, string> = {
    participant_name: participantName,
    participant_first_name: participant.first_name,
    connector_name: connectorName,
    meeting_when: meetingWhen,
  };

  // Notify EVERY connector on the meeting (both members of a team), by email
  // and (if a staff number is on file) SMS.
  if (notifyConnector) {
    const tpl = await loadTemplate(
      admin,
      participant.church_id,
      'meeting_scheduled_to_connector',
    );
    for (const cp of connectorProfiles) {
      const cName =
        `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || 'your connector';
      if (cp.email && tpl) {
        const vars = {
          ...baseVars,
          recipient_first_name: cp.first_name ?? '',
          recipient_last_name: cp.last_name ?? '',
        };
        await admin.from('notification_outbox').insert({
          church_id: participant.church_id,
          participant_id: participant.id,
          template_key: 'meeting_scheduled_to_connector',
          channel: tpl.channel,
          recipient_email: cp.email,
          recipient_name:
            [cp.first_name, cp.last_name].filter(Boolean).join(' ').trim() || null,
          subject: tpl.subject ? render(tpl.subject, vars) : null,
          body: render(tpl.body, vars),
          status: 'pending',
          metadata: { trigger: 'meeting_scheduled', booking_id: args.bookingId },
        });
      }
      if (cp.phone) {
        await admin.from('notification_outbox').insert({
          church_id: participant.church_id,
          participant_id: participant.id,
          template_key: 'meeting_scheduled_to_connector',
          channel: 'sms',
          recipient_phone: cp.phone,
          recipient_name: cName,
          subject: null,
          body: `${participantName} just scheduled a meeting with you for ${meetingWhen}. Open Encounter Connect to confirm.`,
          status: 'pending',
          metadata: {
            trigger: 'meeting_scheduled',
            booking_id: args.bookingId,
            channel_hint: 'connector_sms',
          },
        });
      }
    }
  }

  if (notifyParticipant) {
    const tpl = await loadTemplate(
      admin,
      participant.church_id,
      'meeting_scheduled_to_participant',
    );
    const delivery = tpl && resolveParticipantDelivery(tpl.channel, participant);
    if (tpl && delivery && delivery.ok) {
      await admin.from('notification_outbox').insert({
        church_id: participant.church_id,
        participant_id: participant.id,
        template_key: 'meeting_scheduled_to_participant',
        channel: tpl.channel,
        recipient_email: participant.email,
        recipient_phone: delivery.recipientPhone,
        recipient_name: participantName || null,
        subject: tpl.subject ? render(tpl.subject, baseVars) : null,
        body: render(tpl.body, baseVars),
        status: 'pending',
        metadata: { trigger: 'meeting_scheduled', booking_id: args.bookingId },
      });
    }
  }
}

/**
 * Display name for a connector in participant-facing copy. When the connector
 * is on an active team, the team's name is used so the participant sees a
 * consistent identity regardless of which member acted.
 */
async function resolveConnectorDisplayName(
  admin: SupabaseClient,
  connectorId: string,
  fallback: string,
): Promise<string> {
  const { data } = await admin
    .from('connector_team_members')
    .select('team:connector_teams!inner(name, is_active)')
    .eq('connector_id', connectorId)
    .maybeSingle();
  const team = (data as unknown as {
    team: { name: string; is_active: boolean } | null;
  } | null)?.team;
  return team && team.is_active ? team.name : fallback;
}

/**
 * Enqueues a notification to the participant when their connector
 * confirms or declines a pending meeting. Best-effort.
 */
export async function enqueueMeetingDecision(
  admin: SupabaseClient,
  args: {
    participantId: string;
    connectorId: string;
    bookingId: string;
    startsAt: Date;
    decision: 'confirmed' | 'declined';
  },
): Promise<void> {
  const [participantResult, connectorResult] = await Promise.all([
    admin
      .from('participants')
      .select('id, first_name, last_name, email, phone, church_id, sms_consent_at')
      .eq('id', args.participantId)
      .maybeSingle(),
    admin
      .from('connectors')
      .select(
        'id, profile:profiles!connectors_profile_id_fkey(first_name, last_name, email)',
      )
      .eq('id', args.connectorId)
      .maybeSingle(),
  ]);

  const participant = participantResult.data as ParticipantContext | null;
  if (!participant) return;
  const connectorProfile =
    (connectorResult.data as { profile: ConnectorContact | null } | null)?.profile ?? null;
  const ownName = connectorProfile
    ? `${connectorProfile.first_name ?? ''} ${connectorProfile.last_name ?? ''}`.trim() || 'your connector'
    : 'your connector';
  const connectorName = await resolveConnectorDisplayName(admin, args.connectorId, ownName);

  const settings = await getNotificationSettings(admin, participant.church_id);
  if (!settings.meeting_decision_enabled) return;

  const meetingWhen = args.startsAt.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const key: NotificationTemplateKey =
    args.decision === 'confirmed'
      ? 'meeting_confirmed_to_participant'
      : 'meeting_declined_to_participant';

  const tpl = await loadTemplate(admin, participant.church_id, key);
  if (!tpl) return;

  const participantName = `${participant.first_name} ${participant.last_name}`.trim();
  const vars: Record<string, string> = {
    participant_name: participantName,
    participant_first_name: participant.first_name,
    connector_name: connectorName,
    meeting_when: meetingWhen,
  };

  // Notify the participant by BOTH email and (if opted in) SMS.
  const rows: Record<string, unknown>[] = [];
  const meta = { trigger: `meeting_${args.decision}`, booking_id: args.bookingId };

  if (participant.email) {
    rows.push({
      church_id: participant.church_id,
      participant_id: participant.id,
      template_key: key,
      channel: 'email',
      recipient_email: participant.email,
      recipient_name: participantName || null,
      subject: tpl.subject ? render(tpl.subject, vars) : null,
      body: render(tpl.body, vars),
      status: 'pending',
      metadata: meta,
    });
  }

  if (participant.sms_consent_at && participant.phone) {
    const smsBody =
      args.decision === 'confirmed'
        ? `${connectorName} confirmed your meeting on ${meetingWhen}. See you then! — Encounter Connect`
        : `${connectorName} can't make ${meetingWhen}. Open Encounter Connect to pick a new time.`;
    rows.push({
      church_id: participant.church_id,
      participant_id: participant.id,
      template_key: key,
      channel: 'sms',
      recipient_phone: participant.phone,
      recipient_name: participantName || null,
      subject: null,
      body: smsBody,
      status: 'pending',
      metadata: meta,
    });
  }

  if (rows.length > 0) {
    await admin.from('notification_outbox').insert(rows);
  }
}

/**
 * Shares the connector's meeting notes with the participant after a meeting
 * is completed: full notes by email, and a short alert by SMS (if opted in).
 * Best-effort.
 */
export async function enqueueMeetingNotes(
  admin: SupabaseClient,
  args: { participantId: string; connectorId: string; notes: string },
): Promise<void> {
  const notes = (args.notes ?? '').trim();
  if (!notes) return;

  const [participantResult, connectorResult] = await Promise.all([
    admin
      .from('participants')
      .select('id, first_name, last_name, email, phone, church_id, sms_consent_at')
      .eq('id', args.participantId)
      .maybeSingle(),
    admin
      .from('connectors')
      .select('id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)')
      .eq('id', args.connectorId)
      .maybeSingle(),
  ]);

  const participant = participantResult.data as ParticipantContext | null;
  if (!participant) return;
  const connectorProfile =
    (connectorResult.data as { profile: ConnectorContact | null } | null)?.profile ?? null;
  const ownName = connectorProfile
    ? `${connectorProfile.first_name ?? ''} ${connectorProfile.last_name ?? ''}`.trim() || 'your connector'
    : 'your connector';
  const connectorName = await resolveConnectorDisplayName(admin, args.connectorId, ownName);
  const participantName = `${participant.first_name} ${participant.last_name}`.trim();

  const settings = await getNotificationSettings(admin, participant.church_id);
  if (!settings.meeting_notes_enabled) return;

  const rows: Record<string, unknown>[] = [];
  const meta = { trigger: 'meeting_notes', connector_id: args.connectorId };

  if (participant.email) {
    rows.push({
      church_id: participant.church_id,
      participant_id: participant.id,
      template_key: 'meeting_notes_to_participant',
      channel: 'email',
      recipient_email: participant.email,
      recipient_name: participantName || null,
      subject: `Notes from your meeting with ${connectorName}`,
      body:
        `Hi ${participant.first_name},\n\n` +
        `Here are the notes ${connectorName} shared from your meeting:\n\n` +
        `${notes}\n\n— Encounter Connect`,
      status: 'pending',
      metadata: meta,
    });
  }

  if (participant.sms_consent_at && participant.phone) {
    rows.push({
      church_id: participant.church_id,
      participant_id: participant.id,
      template_key: 'meeting_notes_to_participant',
      channel: 'sms',
      recipient_phone: participant.phone,
      recipient_name: participantName || null,
      subject: null,
      body: `${connectorName} shared notes from your meeting. Open Encounter Connect to read them.`,
      status: 'pending',
      metadata: meta,
    });
  }

  if (rows.length > 0) {
    await admin.from('notification_outbox').insert(rows);
  }
}

interface StaleSweepReport {
  churchesScanned: number;
  participantsScanned: number;
  enqueued3Day: number;
  enqueued7Day: number;
  skippedDuplicate: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sweeps for participants idle on their current step at the 3-day and
 * 7-day thresholds and enqueues reminder rows. Idempotent: each (participant,
 * step, threshold) combination has a unique outbox idempotency key, so
 * re-running this function never produces duplicates.
 *
 * Intended to be called by a daily cron (Vercel Cron, pg_cron, or Supabase
 * scheduled function). See app/api/cron/notifications-stale-sweep/route.ts.
 */
export async function enqueueStaleReminders(
  admin: SupabaseClient,
): Promise<StaleSweepReport> {
  const report: StaleSweepReport = {
    churchesScanned: 0,
    participantsScanned: 0,
    enqueued3Day: 0,
    enqueued7Day: 0,
    skippedDuplicate: 0,
  };

  const now = Date.now();
  // Prefilter with a 1-day floor so churches that set a first-reminder
  // threshold below the default 3 days are still caught; exact per-church
  // thresholds are applied in the loop below.
  const prefilter = new Date(now - 1 * DAY_MS).toISOString();

  const { data: rows } = await admin
    .from('participant_progress')
    .select(
      `id, participant_id, flow_step_id, status, updated_at,
       participant:participants!inner(
         id, church_id, first_name, last_name, email, phone, status, sms_consent_at
       ),
       flow_step:flow_steps!inner(id, title)`,
    )
    .eq('status', 'in_progress')
    .lt('updated_at', prefilter);

  type Row = {
    participant_id: string;
    flow_step_id: string;
    updated_at: string;
    participant: {
      id: string;
      church_id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      status: string;
      sms_consent_at: string | null;
    };
    flow_step: { id: string; title: string };
  };

  const list = (rows ?? []) as unknown as Row[];
  report.participantsScanned = list.length;
  const churches = new Set<string>();

  // Cache template lookups per (church, key).
  const templateCache = new Map<
    string,
    { channel: NotificationChannel; subject: string | null; body: string } | null
  >();
  async function getTemplate(churchId: string, key: NotificationTemplateKey) {
    const cacheKey = `${churchId}:${key}`;
    if (templateCache.has(cacheKey)) return templateCache.get(cacheKey)!;
    const t = await loadTemplate(admin, churchId, key);
    templateCache.set(cacheKey, t);
    return t;
  }

  // Cache settings per church.
  const settingsCache = new Map<string, NotificationSettings>();
  async function getSettings(churchId: string) {
    const cached = settingsCache.get(churchId);
    if (cached) return cached;
    const s = await getNotificationSettings(admin, churchId);
    settingsCache.set(churchId, s);
    return s;
  }

  for (const row of list) {
    if (row.participant.status === 'inactive' || row.participant.status === 'completed') {
      continue;
    }

    const settings = await getSettings(row.participant.church_id);
    if (!settings.stale_reminders_enabled) continue;

    churches.add(row.participant.church_id);

    const idleMs = now - new Date(row.updated_at).getTime();
    const idleDays = idleMs / DAY_MS;

    // Tier days come from the church's settings (defaults 3 / 7). The first
    // tier reuses the step_stale_3_day template key, the second 7_day.
    const tiers: Array<{ key: NotificationTemplateKey; days: number; tier: 'first' | 'second' }> = [];
    if (idleDays >= settings.stale_first_reminder_days) {
      tiers.push({ key: 'step_stale_3_day', days: settings.stale_first_reminder_days, tier: 'first' });
    }
    if (
      settings.stale_second_reminder_days > settings.stale_first_reminder_days &&
      idleDays >= settings.stale_second_reminder_days
    ) {
      tiers.push({ key: 'step_stale_7_day', days: settings.stale_second_reminder_days, tier: 'second' });
    }

    for (const tier of tiers) {
      const idempotencyKey = `stale:${row.participant.id}:${row.flow_step.id}:${tier.days}d`;
      const template = await getTemplate(row.participant.church_id, tier.key);
      if (!template) continue;

      // Honor SMS consent: an SMS reminder only goes to opted-in participants.
      const delivery = resolveParticipantDelivery(template.channel, row.participant);
      if (!delivery.ok) continue;

      const vars: Record<string, string> = {
        participant_name: `${row.participant.first_name} ${row.participant.last_name}`.trim(),
        participant_first_name: row.participant.first_name,
        step_title: row.flow_step.title,
      };

      const insert = await admin.from('notification_outbox').insert({
        church_id: row.participant.church_id,
        participant_id: row.participant.id,
        step_id: row.flow_step.id,
        template_key: tier.key,
        channel: template.channel,
        recipient_email: row.participant.email,
        recipient_phone: delivery.recipientPhone,
        recipient_name:
          `${row.participant.first_name} ${row.participant.last_name}`.trim() || null,
        subject: template.subject ? render(template.subject, vars) : null,
        body: render(template.body, vars),
        status: 'pending',
        metadata: { trigger: `stale_${tier.days}_day`, idle_days: idleDays },
        idempotency_key: idempotencyKey,
      });

      if (insert.error) {
        // Unique violation = already enqueued, expected.
        if (insert.error.code === '23505') {
          report.skippedDuplicate += 1;
        }
      } else {
        if (tier.tier === 'first') report.enqueued3Day += 1;
        else report.enqueued7Day += 1;
      }
    }
  }

  report.churchesScanned = churches.size;
  return report;
}

interface AvailabilityReminderReport {
  connectorsScanned: number;
  unitsNeedingAvailability: number;
  enqueued: number;
  skippedDuplicate: number;
}

/**
 * Sweeps for connectors (and connector teams) who have no availability set
 * for the near future and enqueues a reminder to each. Team-aware: a team's
 * SHARED calendar is checked once, and both members are reminded only when
 * it's empty — so one member isn't nagged after the other filled it.
 *
 * Idempotent per church-configured interval: each (connector, channel,
 * interval-bucket) has a unique outbox key, so a connector is reminded at
 * most once per `availability_reminder_interval_days` until they fill it.
 *
 * Intended for a weekly cron. See
 * app/api/cron/notifications-availability-reminders/route.ts.
 */
export async function enqueueAvailabilityReminders(
  admin: SupabaseClient,
): Promise<AvailabilityReminderReport> {
  const report: AvailabilityReminderReport = {
    connectorsScanned: 0,
    unitsNeedingAvailability: 0,
    enqueued: 0,
    skippedDuplicate: 0,
  };

  const { data: connectorsRaw } = await admin
    .from('connectors')
    .select(
      'id, church_id, scheduling_resource_id, profile:profiles!connectors_profile_id_fkey(first_name, last_name, email, phone)',
    )
    .eq('is_active', true);

  type Conn = {
    id: string;
    church_id: string | null;
    scheduling_resource_id: string | null;
    profile: {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
  };
  const connectors = (connectorsRaw ?? []) as unknown as Conn[];
  report.connectorsScanned = connectors.length;
  if (connectors.length === 0) return report;

  const connById = new Map(connectors.map((c) => [c.id, c]));

  const settingsCache = new Map<string, NotificationSettings>();
  async function getSettings(churchId: string) {
    const cached = settingsCache.get(churchId);
    if (cached) return cached;
    const s = await getNotificationSettings(admin, churchId);
    settingsCache.set(churchId, s);
    return s;
  }

  // Collapse connectors into scheduling units (team = one shared resource +
  // both members; solo = own resource), reusing the teams query.
  const teamMap = await getActiveTeamsForConnectors(
    admin,
    connectors.map((c) => c.id),
  );
  interface Unit {
    resourceId: string | null;
    churchId: string;
    memberConnectorIds: string[];
  }
  const teamUnits = new Map<string, Unit>();
  const units: Unit[] = [];
  for (const c of connectors) {
    if (!c.church_id) continue;
    const team = teamMap.get(c.id);
    if (team) {
      const existing = teamUnits.get(team.teamId);
      if (existing) {
        existing.memberConnectorIds.push(c.id);
      } else {
        const unit: Unit = {
          resourceId: team.resourceId,
          churchId: c.church_id,
          memberConnectorIds: [c.id],
        };
        teamUnits.set(team.teamId, unit);
        units.push(unit);
      }
    } else {
      units.push({
        resourceId: c.scheduling_resource_id,
        churchId: c.church_id,
        memberConnectorIds: [c.id],
      });
    }
  }

  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);

  for (const unit of units) {
    const settings = await getSettings(unit.churchId);
    if (!settings.availability_reminders_enabled) continue;

    const horizon = Math.max(1, settings.availability_reminder_horizon_days);
    const interval = Math.max(1, settings.availability_reminder_interval_days);
    const horizonStr = new Date(now + horizon * DAY_MS).toISOString().slice(0, 10);

    // Does the unit have any availability in the horizon window?
    let hasAvailability = false;
    if (unit.resourceId) {
      const { count } = await admin
        .from('scheduling_availability_rules')
        .select('id', { count: 'exact', head: true })
        .eq('resource_id', unit.resourceId)
        .eq('rule_type', 'date_specific')
        .eq('is_active', true)
        .gte('effective_from', todayStr)
        .lte('effective_from', horizonStr);
      hasAvailability = (count ?? 0) > 0;
    }
    if (hasAvailability) continue;

    report.unitsNeedingAvailability += 1;

    const template = await loadTemplate(admin, unit.churchId, 'connector_availability_reminder');
    if (!template) continue;

    // Interval bucket: a connector is reminded at most once per interval.
    const bucket = Math.floor(now / DAY_MS / interval);

    for (const connectorId of unit.memberConnectorIds) {
      const conn = connById.get(connectorId);
      if (!conn?.profile) continue;
      const first = conn.profile.first_name ?? '';
      const name = `${first} ${conn.profile.last_name ?? ''}`.trim() || null;
      const vars: Record<string, string> = {
        recipient_first_name: first,
        horizon_days: String(horizon),
      };

      if (conn.profile.email) {
        const insert = await admin.from('notification_outbox').insert({
          church_id: unit.churchId,
          template_key: 'connector_availability_reminder',
          channel: 'email',
          recipient_email: conn.profile.email,
          recipient_name: name,
          subject: template.subject ? render(template.subject, vars) : null,
          body: render(template.body, vars),
          status: 'pending',
          metadata: { trigger: 'availability_reminder', connector_id: connectorId },
          idempotency_key: `avail_reminder:${connectorId}:email:${bucket}`,
        });
        if (insert.error) {
          if (insert.error.code === '23505') report.skippedDuplicate += 1;
        } else {
          report.enqueued += 1;
        }
      }

      if (conn.profile.phone) {
        const insert = await admin.from('notification_outbox').insert({
          church_id: unit.churchId,
          template_key: 'connector_availability_reminder',
          channel: 'sms',
          recipient_phone: conn.profile.phone,
          recipient_name: name,
          subject: null,
          body:
            `You have no availability set for the next ${horizon} days, so no one ` +
            `can book a meeting with you. Open Encounter Connect to add times.`,
          status: 'pending',
          metadata: {
            trigger: 'availability_reminder',
            connector_id: connectorId,
            channel_hint: 'connector_sms',
          },
          idempotency_key: `avail_reminder:${connectorId}:sms:${bucket}`,
        });
        if (insert.error) {
          if (insert.error.code === '23505') report.skippedDuplicate += 1;
        } else {
          report.enqueued += 1;
        }
      }
    }
  }

  return report;
}
