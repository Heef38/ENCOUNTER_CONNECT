import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Coverage report for a church's default flows. A brand-new participant is
 * only auto-enrolled when `resolveDefaultFlowId` (lib/flows/engine.ts) finds a
 * usable default — an active `is_default` flow that actually has steps — for
 * their campus or church-wide. This mirrors that logic so admins can see, at a
 * glance, where signups would land with an empty journey.
 *
 * - A church-wide signup (`/c/[church]`) needs a usable church-wide default.
 * - A campus signup (`/c/[church]/[campus]`) needs the campus's own default OR
 *   the church-wide one as fallback.
 */
export interface DefaultFlowCoverage {
  /** True when every signup path would auto-enroll into a non-empty flow. */
  ok: boolean;
  /** A church-wide `is_default` flow with at least one step exists & is active. */
  usableChurchWideDefault: boolean;
  totalCampuses: number;
  /** Active campuses with no usable default of their own and no church-wide fallback. */
  campusesWithoutCoverage: { id: string; name: string }[];
}

export async function getDefaultFlowCoverage(
  supabase: SupabaseClient,
  churchId: string,
): Promise<DefaultFlowCoverage> {
  const [{ data: flowsData }, { data: campusesData }] = await Promise.all([
    supabase
      .from('flows')
      .select('id, campus_id')
      .eq('church_id', churchId)
      .eq('is_default', true)
      .eq('is_active', true),
    supabase
      .from('campuses')
      .select('id, name')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('name'),
  ]);

  const defaultFlows = (flowsData ?? []) as { id: string; campus_id: string | null }[];
  const campuses = (campusesData ?? []) as { id: string; name: string }[];

  // Only default flows that actually have steps count — an empty default would
  // create an empty journey, which is exactly the gap this report surfaces.
  const flowIds = defaultFlows.map((f) => f.id);
  const flowsWithSteps = new Set<string>();
  if (flowIds.length > 0) {
    const { data: steps } = await supabase
      .from('flow_steps')
      .select('flow_id')
      .in('flow_id', flowIds);
    for (const s of (steps ?? []) as { flow_id: string }[]) {
      flowsWithSteps.add(s.flow_id);
    }
  }

  const usableChurchWideDefault = defaultFlows.some(
    (f) => f.campus_id === null && flowsWithSteps.has(f.id),
  );
  const campusOwnDefault = new Set(
    defaultFlows
      .filter((f) => f.campus_id !== null && flowsWithSteps.has(f.id))
      .map((f) => f.campus_id as string),
  );

  const campusesWithoutCoverage = usableChurchWideDefault
    ? []
    : campuses.filter((c) => !campusOwnDefault.has(c.id));

  // Fully covered when the church-wide default exists (covers everything), or
  // there's at least one campus and every campus has its own default.
  const ok = usableChurchWideDefault
    ? true
    : campuses.length > 0 && campusesWithoutCoverage.length === 0;

  return {
    ok,
    usableChurchWideDefault,
    totalCampuses: campuses.length,
    campusesWithoutCoverage,
  };
}
