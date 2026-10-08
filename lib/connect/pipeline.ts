import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The connect ministry's pipeline, from the database's own rule
 * (ec_connect_pipeline, migration 034): one stage per newcomer, derived
 * from facts, plus flags for what needs attention. The This week console,
 * the participants list, the Monday digest and the contact nudges all read
 * this, so they can never disagree about who is stuck.
 */

export type Stage = 'new' | 'contacted' | 'met' | 'plugged_in' | 'serving' | 'inactive';
export type Flag = 'needs_contact' | 'unassigned' | 'stalled' | 'needs_table';

export const STAGES: Array<{ key: Stage; label: string; hint: string }> = [
  { key: 'new', label: 'New', hint: 'Nobody has reached out yet' },
  { key: 'contacted', label: 'Contacted', hint: 'Someone reached out' },
  { key: 'met', label: 'Met', hint: 'Had a first meeting' },
  { key: 'plugged_in', label: 'At a table', hint: 'In a group, or coming to gatherings' },
  { key: 'serving', label: 'Serving', hint: 'On a serve team' },
  { key: 'inactive', label: 'Inactive', hint: 'Marked inactive' },
];

export const FLAGS: Record<Flag, { label: string; tone: 'danger' | 'warning' | 'info' }> = {
  needs_contact: { label: 'Not contacted yet', tone: 'danger' },
  unassigned: { label: 'No connector', tone: 'warning' },
  stalled: { label: 'Gone quiet', tone: 'warning' },
  needs_table: { label: 'Not at a table yet', tone: 'info' },
};

export interface PipelineRow {
  participant_id: string;
  stage: Stage;
  flags: Flag[];
  days_since_signup: number;
  days_since_contact: number | null;
  first_name: string;
  last_name: string;
  profile_id: string | null;
  campus_id: string | null;
  campus_name: string | null;
  assigned_connector_id: string | null;
  connector_name: string | null;
  signed_up_at: string | null;
  last_personal_contact_at: string | null;
}

interface RawStage {
  participant_id: string;
  stage: Stage;
  flags: Flag[];
  days_since_signup: number;
  days_since_contact: number | null;
}

/**
 * The pipeline for one church. With the default client it reads through the
 * caller's RLS (staff only); sweeps pass the service-role client.
 */
export async function getPipeline(
  churchId: string,
  opts: { client?: SupabaseClient; connectorId?: string } = {},
): Promise<PipelineRow[]> {
  const supabase = opts.client ?? (await createServerSupabaseClient());
  const { data: stages, error } = await supabase.rpc('ec_connect_pipeline', { cid: churchId });
  if (error || !stages) return [];
  const byId = new Map((stages as RawStage[]).map((r) => [r.participant_id, r]));
  if (byId.size === 0) return [];

  const { data: people } = await supabase
    .from('participants')
    .select('id, first_name, last_name, profile_id, campus_id, assigned_connector_id, signed_up_at, created_at, last_personal_contact_at, campus:campuses(name)')
    .eq('church_id', churchId);

  let rows = ((people ?? []) as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    profile_id: string | null;
    campus_id: string | null;
    assigned_connector_id: string | null;
    signed_up_at: string | null;
    created_at: string;
    last_personal_contact_at: string | null;
    campus: { name: string } | null;
  }>).filter((p) => byId.has(p.id));

  if (opts.connectorId) {
    const { data: links } = await supabase
      .from('participant_connectors')
      .select('participant_id')
      .eq('connector_id', opts.connectorId);
    const mine = new Set(((links ?? []) as Array<{ participant_id: string }>).map((l) => l.participant_id));
    rows = rows.filter((p) => p.assigned_connector_id === opts.connectorId || mine.has(p.id));
  }

  // Connector names: staff names, read with the service role because a
  // volunteer connector's session cannot read other staff profiles.
  const connectorIds = Array.from(new Set(rows.map((r) => r.assigned_connector_id).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (connectorIds.length) {
    const admin = await createServiceRoleClient();
    const { data: conns } = await admin
      .from('connectors')
      .select('id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)')
      .in('id', connectorIds);
    for (const c of (conns ?? []) as unknown as Array<{ id: string; profile: { first_name: string; last_name: string } | null }>) {
      if (c.profile) names.set(c.id, `${c.profile.first_name} ${c.profile.last_name}`.trim());
    }
  }

  return rows.map((p) => {
    const s = byId.get(p.id) as RawStage;
    return {
      participant_id: p.id,
      stage: s.stage,
      flags: (s.flags ?? []) as Flag[],
      days_since_signup: s.days_since_signup,
      days_since_contact: s.days_since_contact,
      first_name: p.first_name,
      last_name: p.last_name,
      profile_id: p.profile_id,
      campus_id: p.campus_id,
      campus_name: p.campus?.name ?? null,
      assigned_connector_id: p.assigned_connector_id,
      connector_name: p.assigned_connector_id ? names.get(p.assigned_connector_id) ?? null : null,
      signed_up_at: p.signed_up_at ?? p.created_at,
      last_personal_contact_at: p.last_personal_contact_at,
    };
  });
}

export function summarize(rows: PipelineRow[]) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, 0])) as Record<Stage, number>;
  const buckets: Record<Flag, PipelineRow[]> = { needs_contact: [], unassigned: [], stalled: [], needs_table: [] };
  for (const r of rows) {
    counts[r.stage] += 1;
    for (const f of r.flags) buckets[f]?.push(r);
  }
  // Longest-waiting first.
  for (const list of Object.values(buckets)) list.sort((a, b) => b.days_since_signup - a.days_since_signup);
  const newThisWeek = rows.filter((r) => r.days_since_signup < 7).length;
  return { counts, buckets, newThisWeek, total: rows.length };
}

export interface TouchRow {
  id: string;
  kind: string;
  source: 'manual' | 'system';
  summary: string | null;
  occurred_at: string;
  created_by_name: string | null;
}

const KIND_LABEL: Record<string, string> = {
  call: 'Called',
  text: 'Texted',
  email: 'Emailed',
  in_person: 'Talked in person',
  note: 'Note',
  meeting_booked: 'First meeting booked',
  meeting_held: 'First meeting held',
  message_sent: 'Message sent',
};

export function touchLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** A participant's contact history. RLS: the church's staff only. */
export async function listTouches(participantId: string): Promise<TouchRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('participant_touches')
    .select('id, kind, source, summary, occurred_at, created_by_profile_id')
    .eq('participant_id', participantId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  const rows = (data ?? []) as Array<{ id: string; kind: string; source: 'manual' | 'system'; summary: string | null; occurred_at: string; created_by_profile_id: string | null }>;
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by_profile_id).filter((x): x is string => !!x)));
  const names = new Map<string, string>();
  if (authorIds.length) {
    const admin = await createServiceRoleClient();
    const { data: authors } = await admin.from('profiles').select('id, first_name, last_name').in('id', authorIds);
    for (const a of (authors ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
      names.set(a.id, `${a.first_name} ${a.last_name}`.trim());
    }
  }
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    source: r.source,
    summary: r.summary,
    occurred_at: r.occurred_at,
    created_by_name: r.created_by_profile_id ? names.get(r.created_by_profile_id) ?? null : null,
  }));
}

/** One participant's stage and flags. */
export async function getParticipantStage(churchId: string, participantId: string): Promise<{ stage: Stage; flags: Flag[] } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('ec_connect_pipeline', { cid: churchId });
  const row = ((data ?? []) as RawStage[]).find((r) => r.participant_id === participantId);
  return row ? { stage: row.stage, flags: row.flags ?? [] } : null;
}
