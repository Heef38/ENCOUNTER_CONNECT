import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationChannel,
  NotificationTemplate,
  NotificationTemplateKey,
} from './types';

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
}

interface ConnectorContact {
  email: string | null;
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
      'id, first_name, last_name, email, phone, church_id, assigned_connector_id, current_step_id',
    )
    .eq('id', participantId)
    .maybeSingle();

  const participant = participantRow as ParticipantContext | null;
  if (!participant) return;
  if (!participant.assigned_connector_id) return; // no one to notify

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
    connectorId: string;
    bookingId: string;
    startsAt: Date;
    notifyConnector?: boolean;
    notifyParticipant?: boolean;
  },
): Promise<void> {
  const notifyConnector = args.notifyConnector ?? true;
  const notifyParticipant = args.notifyParticipant ?? true;
  if (!notifyConnector && !notifyParticipant) return;

  const [participantResult, connectorResult] = await Promise.all([
    admin
      .from('participants')
      .select('id, first_name, last_name, email, phone, church_id')
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

  const connectorName = connectorProfile
    ? `${connectorProfile.first_name ?? ''} ${connectorProfile.last_name ?? ''}`.trim() || 'your connector'
    : 'your connector';
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

  if (notifyConnector && connectorProfile?.email) {
    const tpl = await loadTemplate(
      admin,
      participant.church_id,
      'meeting_scheduled_to_connector',
    );
    if (tpl) {
      const vars = {
        ...baseVars,
        recipient_first_name: connectorProfile.first_name ?? '',
        recipient_last_name: connectorProfile.last_name ?? '',
      };
      await admin.from('notification_outbox').insert({
        church_id: participant.church_id,
        participant_id: participant.id,
        template_key: 'meeting_scheduled_to_connector',
        channel: tpl.channel,
        recipient_email: connectorProfile.email,
        recipient_name:
          [connectorProfile.first_name, connectorProfile.last_name]
            .filter(Boolean)
            .join(' ')
            .trim() || null,
        subject: tpl.subject ? render(tpl.subject, vars) : null,
        body: render(tpl.body, vars),
        status: 'pending',
        metadata: { trigger: 'meeting_scheduled', booking_id: args.bookingId },
      });
    }
  }

  if (notifyParticipant && participant.email) {
    const tpl = await loadTemplate(
      admin,
      participant.church_id,
      'meeting_scheduled_to_participant',
    );
    if (tpl) {
      await admin.from('notification_outbox').insert({
        church_id: participant.church_id,
        participant_id: participant.id,
        template_key: 'meeting_scheduled_to_participant',
        channel: tpl.channel,
        recipient_email: participant.email,
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
      .select('id, first_name, last_name, email, phone, church_id')
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
  if (!participant?.email) return;
  const connectorProfile =
    (connectorResult.data as { profile: ConnectorContact | null } | null)?.profile ?? null;
  const connectorName = connectorProfile
    ? `${connectorProfile.first_name ?? ''} ${connectorProfile.last_name ?? ''}`.trim() || 'your connector'
    : 'your connector';

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

  const vars: Record<string, string> = {
    participant_name: `${participant.first_name} ${participant.last_name}`.trim(),
    participant_first_name: participant.first_name,
    connector_name: connectorName,
    meeting_when: meetingWhen,
  };

  await admin.from('notification_outbox').insert({
    church_id: participant.church_id,
    participant_id: participant.id,
    template_key: key,
    channel: tpl.channel,
    recipient_email: participant.email,
    recipient_name: vars.participant_name || null,
    subject: tpl.subject ? render(tpl.subject, vars) : null,
    body: render(tpl.body, vars),
    status: 'pending',
    metadata: { trigger: `meeting_${args.decision}`, booking_id: args.bookingId },
  });
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
  const threshold3 = new Date(now - 3 * DAY_MS).toISOString();

  const { data: rows } = await admin
    .from('participant_progress')
    .select(
      `id, participant_id, flow_step_id, status, updated_at,
       participant:participants!inner(
         id, church_id, first_name, last_name, email, phone, status
       ),
       flow_step:flow_steps!inner(id, title)`,
    )
    .eq('status', 'in_progress')
    .lt('updated_at', threshold3);

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

  for (const row of list) {
    if (row.participant.status === 'inactive' || row.participant.status === 'completed') {
      continue;
    }
    if (!row.participant.email) continue; // need an address to send

    churches.add(row.participant.church_id);

    const idleMs = now - new Date(row.updated_at).getTime();
    const idleDays = idleMs / DAY_MS;

    const tiers: Array<{ key: NotificationTemplateKey; days: number }> = [];
    if (idleDays >= 3) tiers.push({ key: 'step_stale_3_day', days: 3 });
    if (idleDays >= 7) tiers.push({ key: 'step_stale_7_day', days: 7 });

    for (const tier of tiers) {
      const idempotencyKey = `stale:${row.participant.id}:${row.flow_step.id}:${tier.days}d`;
      const template = await getTemplate(row.participant.church_id, tier.key);
      if (!template) continue;

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
        recipient_phone: row.participant.phone,
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
        if (tier.days === 3) report.enqueued3Day += 1;
        else if (tier.days === 7) report.enqueued7Day += 1;
      }
    }
  }

  report.churchesScanned = churches.size;
  return report;
}
