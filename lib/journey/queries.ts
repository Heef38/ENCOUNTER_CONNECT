import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlowStepType } from '@/lib/flows/types';

export interface JourneyStep {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  flow_step: {
    id: string;
    title: string;
    description: string | null;
    step_type: FlowStepType;
    order_index: number;
    phase_index: number;
    is_required: boolean;
  } | null;
}

export interface JourneyParticipant {
  id: string;
  first_name: string;
  status: string;
  campus: {
    id: string;
    name: string;
    hero_image_url: string | null;
    intro_text: string | null;
    body: string | null;
    brand_color: string | null;
  } | null;
  connector: {
    profile: { first_name: string; last_name: string; email: string | null } | null;
  } | null;
  progress: JourneyStep[] | null;
}

/**
 * Loads the signed-in participant's record plus their full journey progress.
 * Single source of truth shared by the resume-router, the step screen, and
 * the journey map. Uses the session client, so it relies on the
 * `participants_read_own` RLS policy (profile_id = auth.uid()).
 */
export async function loadParticipantJourney(
  supabase: SupabaseClient,
  profileId: string,
): Promise<JourneyParticipant | null> {
  const { data } = await supabase
    .from('participants')
    .select(
      `id, first_name, status,
       campus:campuses(id, name, hero_image_url, intro_text, body, brand_color),
       connector:connectors!participants_assigned_connector_id_fkey(
         profile:profiles!connectors_profile_id_fkey(first_name, last_name, email)
       ),
       progress:participant_progress(
         id, status, completed_at,
         flow_step:flow_steps(id, title, description, step_type, order_index, phase_index, is_required)
       )`,
    )
    .eq('profile_id', profileId)
    .maybeSingle();

  return (data as unknown as JourneyParticipant | null) ?? null;
}

/**
 * Progress rows in journey order — by `order_index`, matching the flow
 * editor's drag order and the journey map exactly. (Reorder keeps
 * `phase_index` consistent with `order_index`, so this also respects phase
 * grouping.)
 */
export function orderedProgress(participant: JourneyParticipant): JourneyStep[] {
  return (participant.progress ?? [])
    .slice()
    .filter((s) => s.flow_step !== null)
    .sort((a, b) => (a.flow_step?.order_index ?? 0) - (b.flow_step?.order_index ?? 0));
}

/**
 * The progress id of the step the participant should be on right now:
 * the first in-progress step, else the first pending step, else null when
 * every step is completed/skipped (journey finished).
 */
export function resolveCurrentProgressId(ordered: JourneyStep[]): string | null {
  const active = ordered.find((s) => s.status === 'in_progress');
  if (active) return active.id;
  const next = ordered.find((s) => s.status === 'pending');
  if (next) return next.id;
  return null;
}

/**
 * The progress id of the next step to send the participant to after they
 * finish `currentProgressId`: the first non-completed, non-skipped step that
 * isn't the current one, in journey order. Null ⇒ nothing left (finished).
 */
export function resolveNextProgressId(
  ordered: JourneyStep[],
  currentProgressId: string,
): string | null {
  const next = ordered.find(
    (s) =>
      s.id !== currentProgressId &&
      s.status !== 'completed' &&
      s.status !== 'skipped',
  );
  return next ? next.id : null;
}
