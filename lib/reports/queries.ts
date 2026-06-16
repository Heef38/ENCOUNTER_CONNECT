import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Reporting queries for the church admin /reports surface. All are
 * church-scoped: callers pass the admin's `church_id`, and every query either
 * filters on it directly or derives its working set from rows that already
 * belong to the church (e.g. flow-step ids). A service-role client is used so
 * counts are complete and not clipped by per-row RLS — tenant safety comes
 * from the explicit church scoping, mirroring the dashboard queries.
 */

const DAY_MS = 86_400_000;
const DONE_STATUSES = new Set(['completed', 'skipped']);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Flow completion ───────────────────────────────────────────

export interface FlowCompletionRow {
  flowId: string;
  flowName: string;
  isActive: boolean;
  stepCount: number;
  enrolled: number;
  finished: number;
  inProgress: number;
  /** finished / enrolled, 0..1. 0 when nobody is enrolled. */
  completionRate: number;
}

/**
 * Per-flow enrollment and completion. A participant is "enrolled" in a flow
 * once they have any progress row for one of its steps, and has "finished"
 * when none of their rows for that flow are still pending/in_progress.
 */
export async function getFlowCompletionStats(
  churchId: string,
): Promise<FlowCompletionRow[]> {
  const admin = await createServiceRoleClient();

  const { data: flowsData } = await admin
    .from('flows')
    .select('id, name, is_active')
    .eq('church_id', churchId)
    .order('is_default', { ascending: false })
    .order('name');

  const flows = (flowsData ?? []) as { id: string; name: string; is_active: boolean }[];
  if (flows.length === 0) return [];

  const flowIds = flows.map((f) => f.id);
  const { data: stepsData } = await admin
    .from('flow_steps')
    .select('id, flow_id')
    .in('flow_id', flowIds);

  const steps = (stepsData ?? []) as { id: string; flow_id: string }[];
  const stepToFlow = new Map(steps.map((s) => [s.id, s.flow_id]));
  const stepCountByFlow = new Map<string, number>();
  for (const s of steps) {
    stepCountByFlow.set(s.flow_id, (stepCountByFlow.get(s.flow_id) ?? 0) + 1);
  }

  const stepIds = steps.map((s) => s.id);

  // (flowId:participantId) → { total rows, open rows }
  const byFlowParticipant = new Map<string, { total: number; open: number }>();
  for (const ids of chunk(stepIds, 300)) {
    if (ids.length === 0) continue;
    const { data: progress } = await admin
      .from('participant_progress')
      .select('participant_id, flow_step_id, status')
      .in('flow_step_id', ids);

    for (const row of (progress ?? []) as {
      participant_id: string;
      flow_step_id: string;
      status: string;
    }[]) {
      const flowId = stepToFlow.get(row.flow_step_id);
      if (!flowId) continue;
      const key = `${flowId}:${row.participant_id}`;
      const entry = byFlowParticipant.get(key) ?? { total: 0, open: 0 };
      entry.total += 1;
      if (!DONE_STATUSES.has(row.status)) entry.open += 1;
      byFlowParticipant.set(key, entry);
    }
  }

  const enrolledByFlow = new Map<string, number>();
  const finishedByFlow = new Map<string, number>();
  for (const [key, entry] of byFlowParticipant) {
    const flowId = key.slice(0, key.indexOf(':'));
    enrolledByFlow.set(flowId, (enrolledByFlow.get(flowId) ?? 0) + 1);
    if (entry.open === 0) {
      finishedByFlow.set(flowId, (finishedByFlow.get(flowId) ?? 0) + 1);
    }
  }

  return flows.map((f) => {
    const enrolled = enrolledByFlow.get(f.id) ?? 0;
    const finished = finishedByFlow.get(f.id) ?? 0;
    return {
      flowId: f.id,
      flowName: f.name,
      isActive: f.is_active,
      stepCount: stepCountByFlow.get(f.id) ?? 0,
      enrolled,
      finished,
      inProgress: enrolled - finished,
      completionRate: enrolled > 0 ? finished / enrolled : 0,
    };
  });
}

// ── Connector activity / capacity ─────────────────────────────

export interface ConnectorActivityRow {
  connectorId: string;
  name: string;
  totalAssigned: number;
  active: number;
  finished: number;
  upcomingMeetings: number;
  avgDaysSinceAction: number | null;
}

/**
 * Per-connector capacity and activity across the church: how many participants
 * they hold, how many are still active vs. finished, upcoming meetings, and how
 * stale their active caseload is on average.
 */
export async function getConnectorActivity(
  churchId: string,
): Promise<ConnectorActivityRow[]> {
  const admin = await createServiceRoleClient();

  const { data: connectorsData } = await admin
    .from('connectors')
    .select('id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)')
    .eq('church_id', churchId)
    .eq('is_active', true);

  const connectors = (connectorsData ?? []) as unknown as {
    id: string;
    profile: { first_name: string; last_name: string } | null;
  }[];
  if (connectors.length === 0) return [];

  const { data: participantsData } = await admin
    .from('participants')
    .select('id, assigned_connector_id, status, last_action_at')
    .eq('church_id', churchId)
    .not('assigned_connector_id', 'is', null);

  const participants = (participantsData ?? []) as {
    id: string;
    assigned_connector_id: string;
    status: string;
    last_action_at: string | null;
  }[];

  // Upcoming meetings per connector: future bookings linked to a progress row
  // whose participant is assigned to that connector.
  const { data: upcomingData } = await admin
    .from('participant_progress')
    .select(
      `participant:participants!inner(assigned_connector_id, church_id),
       booking:scheduling_bookings!inner(starts_at, status)`,
    )
    .not('scheduled_event_id', 'is', null)
    .limit(2000);

  const nowIso = new Date().toISOString();
  const upcomingByConnector = new Map<string, number>();
  for (const row of (upcomingData ?? []) as unknown as {
    participant: { assigned_connector_id: string | null; church_id: string } | null;
    booking: { starts_at: string; status: string } | null;
  }[]) {
    const cid = row.participant?.assigned_connector_id;
    if (!cid || row.participant?.church_id !== churchId || !row.booking) continue;
    if (row.booking.starts_at <= nowIso) continue;
    if (row.booking.status === 'cancelled') continue;
    upcomingByConnector.set(cid, (upcomingByConnector.get(cid) ?? 0) + 1);
  }

  const now = Date.now();
  const stats = new Map<
    string,
    { total: number; active: number; finished: number; staleSum: number; staleN: number }
  >();
  for (const p of participants) {
    const entry = stats.get(p.assigned_connector_id) ?? {
      total: 0,
      active: 0,
      finished: 0,
      staleSum: 0,
      staleN: 0,
    };
    entry.total += 1;
    if (p.status === 'completed') {
      entry.finished += 1;
    } else if (p.status !== 'inactive') {
      entry.active += 1;
      if (p.last_action_at) {
        entry.staleSum += (now - new Date(p.last_action_at).getTime()) / DAY_MS;
        entry.staleN += 1;
      }
    }
    stats.set(p.assigned_connector_id, entry);
  }

  return connectors
    .map((c) => {
      const s = stats.get(c.id);
      return {
        connectorId: c.id,
        name: c.profile
          ? `${c.profile.first_name} ${c.profile.last_name}`.trim() || 'Unnamed'
          : 'Unnamed',
        totalAssigned: s?.total ?? 0,
        active: s?.active ?? 0,
        finished: s?.finished ?? 0,
        upcomingMeetings: upcomingByConnector.get(c.id) ?? 0,
        avgDaysSinceAction:
          s && s.staleN > 0 ? Math.round(s.staleSum / s.staleN) : null,
      };
    })
    .sort((a, b) => b.active - a.active);
}

// ── Participant progress export (CSV) ─────────────────────────

export interface ParticipantExportRow {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  campus: string | null;
  connector: string | null;
  status: string;
  currentStep: string | null;
  stepsCompleted: number;
  stepsTotal: number;
  signedUpAt: string | null;
  lastActionAt: string | null;
}

/**
 * One row per participant in the church, enriched with campus, connector,
 * current step, and step-completion counts. Powers the CSV export.
 */
export async function getParticipantProgressRows(
  churchId: string,
): Promise<ParticipantExportRow[]> {
  const admin = await createServiceRoleClient();

  const { data: participantsData } = await admin
    .from('participants')
    .select(
      `id, first_name, last_name, email, phone, status, signed_up_at, last_action_at,
       campus:campuses(name),
       connector:connectors(profile:profiles!connectors_profile_id_fkey(first_name, last_name)),
       current_step:flow_steps!participants_current_step_id_fkey(title)`,
    )
    .eq('church_id', churchId)
    .order('last_action_at', { ascending: false, nullsFirst: false });

  const participants = (participantsData ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    status: string;
    signed_up_at: string | null;
    last_action_at: string | null;
    campus: { name: string } | null;
    connector: { profile: { first_name: string; last_name: string } | null } | null;
    current_step: { title: string } | null;
  }[];
  if (participants.length === 0) return [];

  // Step-completion counts per participant.
  const ids = participants.map((p) => p.id);
  const counts = new Map<string, { total: number; completed: number }>();
  for (const idChunk of chunk(ids, 300)) {
    if (idChunk.length === 0) continue;
    const { data: progress } = await admin
      .from('participant_progress')
      .select('participant_id, status')
      .in('participant_id', idChunk);
    for (const row of (progress ?? []) as { participant_id: string; status: string }[]) {
      const entry = counts.get(row.participant_id) ?? { total: 0, completed: 0 };
      entry.total += 1;
      if (DONE_STATUSES.has(row.status)) entry.completed += 1;
      counts.set(row.participant_id, entry);
    }
  }

  return participants.map((p) => {
    const c = counts.get(p.id) ?? { total: 0, completed: 0 };
    return {
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      campus: p.campus?.name ?? null,
      connector: p.connector?.profile
        ? `${p.connector.profile.first_name} ${p.connector.profile.last_name}`.trim() || null
        : null,
      status: p.status,
      currentStep: p.current_step?.title ?? null,
      stepsCompleted: c.completed,
      stepsTotal: c.total,
      signedUpAt: p.signed_up_at,
      lastActionAt: p.last_action_at,
    };
  });
}

/** Serializes export rows to RFC-4180 CSV with a header line. */
export function participantRowsToCsv(rows: ParticipantExportRow[]): string {
  const headers = [
    'First name',
    'Last name',
    'Email',
    'Phone',
    'Campus',
    'Connector',
    'Status',
    'Current step',
    'Steps completed',
    'Steps total',
    'Signed up',
    'Last action',
  ];

  const escape = (value: string | number | null): string => {
    const s = value == null ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.firstName,
        r.lastName,
        r.email,
        r.phone,
        r.campus,
        r.connector,
        r.status,
        r.currentStep,
        r.stepsCompleted,
        r.stepsTotal,
        r.signedUpAt,
        r.lastActionAt,
      ]
        .map(escape)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
