import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ConnectorParticipantRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  campus_id: string | null;
  campus_name: string | null;
  current_step_id: string | null;
  current_step_title: string | null;
  last_action_at: string | null;
  progress_done: number;
  progress_total: number;
  is_mine: boolean;
}

interface ListInput {
  connectorId: string;
  /**
   * 'mine'   = participants where this connector is in participant_connectors,
   *            or assigned_connector_id matches (legacy primary).
   * 'campus' = every participant at the connector's campus, mine flagged.
   */
  scope: 'mine' | 'campus';
}

/**
 * Returns participant rows enriched with progress counts + the title of
 * the current step. Used by the connector home and all-campus pages.
 */
export async function listConnectorParticipants(
  supabase: SupabaseClient,
  input: ListInput,
): Promise<ConnectorParticipantRow[]> {
  // 1. Resolve the connector's campus.
  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id, campus_id')
    .eq('id', input.connectorId)
    .maybeSingle();
  const campusId =
    (connectorRow as { campus_id: string | null } | null)?.campus_id ?? null;

  // 2. Resolve "mine" via the join table.
  const { data: assignmentRows } = await supabase
    .from('participant_connectors')
    .select('participant_id')
    .eq('connector_id', input.connectorId);
  const myIdsFromJoin = new Set(
    (assignmentRows ?? []).map((r) => (r as { participant_id: string }).participant_id),
  );

  // 3. Fetch participants in scope.
  let query = supabase
    .from('participants')
    .select(
      `id, first_name, last_name, email, status, campus_id, current_step_id, last_action_at,
       assigned_connector_id,
       campus:campuses(name)`,
    )
    .order('last_action_at', { ascending: false, nullsFirst: false });

  if (input.scope === 'mine') {
    const ids = Array.from(myIdsFromJoin);
    if (ids.length === 0) {
      query = query.eq('assigned_connector_id', input.connectorId);
    } else {
      const idList = ids.map((id) => `id.eq.${id}`).join(',');
      query = query.or(`${idList},assigned_connector_id.eq.${input.connectorId}`);
    }
  } else {
    if (!campusId) return [];
    query = query.eq('campus_id', campusId);
  }

  const { data: participants } = await query;
  if (!participants || participants.length === 0) return [];

  type RawParticipant = {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    status: string;
    campus_id: string | null;
    current_step_id: string | null;
    last_action_at: string | null;
    assigned_connector_id: string | null;
    campus: { name: string } | null;
  };
  const raw = participants as unknown as RawParticipant[];
  const ids = raw.map((p) => p.id);

  // 4. Progress counts.
  const { data: progress } = await supabase
    .from('participant_progress')
    .select('participant_id, status')
    .in('participant_id', ids);

  const counts = new Map<string, { done: number; total: number }>();
  for (const id of ids) counts.set(id, { done: 0, total: 0 });
  for (const row of progress ?? []) {
    const r = row as { participant_id: string; status: string };
    const c = counts.get(r.participant_id);
    if (!c) continue;
    c.total += 1;
    if (r.status === 'completed') c.done += 1;
  }

  // 5. Current step titles.
  const stepIds = raw
    .map((p) => p.current_step_id)
    .filter((id): id is string => !!id);
  const { data: steps } = stepIds.length
    ? await supabase.from('flow_steps').select('id, title').in('id', stepIds)
    : { data: [] };
  const stepTitles = new Map<string, string>();
  for (const s of steps ?? []) {
    const r = s as { id: string; title: string };
    stepTitles.set(r.id, r.title);
  }

  return raw.map((p) => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email,
    status: p.status,
    campus_id: p.campus_id,
    campus_name: p.campus?.name ?? null,
    current_step_id: p.current_step_id,
    current_step_title: p.current_step_id
      ? stepTitles.get(p.current_step_id) ?? null
      : null,
    last_action_at: p.last_action_at,
    progress_done: counts.get(p.id)?.done ?? 0,
    progress_total: counts.get(p.id)?.total ?? 0,
    is_mine: myIdsFromJoin.has(p.id) || p.assigned_connector_id === input.connectorId,
  }));
}

/**
 * Returns the connector's access level for a given participant.
 *  - canRead:  any participant at the connector's campus
 *  - canWrite: only participants assigned to this connector
 */
export async function getConnectorParticipantAccess(
  supabase: SupabaseClient,
  connectorId: string,
  participantId: string,
): Promise<{ canRead: boolean; canWrite: boolean }> {
  const { data: connector } = await supabase
    .from('connectors')
    .select('campus_id')
    .eq('id', connectorId)
    .maybeSingle();
  const campusId =
    (connector as { campus_id: string | null } | null)?.campus_id ?? null;

  const { data: participant } = await supabase
    .from('participants')
    .select('id, campus_id, assigned_connector_id')
    .eq('id', participantId)
    .maybeSingle();
  if (!participant) return { canRead: false, canWrite: false };
  const p = participant as {
    id: string;
    campus_id: string | null;
    assigned_connector_id: string | null;
  };

  const sameCampus = !!campusId && p.campus_id === campusId;
  const isPrimary = p.assigned_connector_id === connectorId;

  const { data: linkRow } = await supabase
    .from('participant_connectors')
    .select('id')
    .eq('participant_id', participantId)
    .eq('connector_id', connectorId)
    .maybeSingle();
  const inJoin = !!linkRow;

  return {
    canRead: sameCampus || isPrimary || inJoin,
    canWrite: isPrimary || inJoin,
  };
}
