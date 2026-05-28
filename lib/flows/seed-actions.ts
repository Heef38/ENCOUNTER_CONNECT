'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/log';
import { createFlow, createFlowStep } from './services';

export interface SeedResult {
  ok: boolean;
  error?: string;
  id?: string;
}

/**
 * Seeds the canonical "Encounter Connect" journey:
 *
 *   1. Watch welcome videos             (trigger=signup,            output=advance)
 *   2. Personal Assessment              (trigger=previous_complete, output=advance)
 *   3. Connect with God Assessment      (trigger=previous_complete, output=advance)
 *   4. Spiritual Gifts Assessment       (trigger=previous_complete, output=advance)
 *   5. Schedule meeting with connector  (trigger=previous_complete, output=auto_match_connector)
 *
 * Returns the new flow's id so the caller can redirect to its editor.
 */
export async function seedEncounterConnectFlow(): Promise<SeedResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const supabase = await createServerSupabaseClient();

  // Try to find an existing "Connect Meeting" appointment type to wire to step 5.
  // Falls back to null — the editor lets the admin pick one later.
  const { data: apptType } = await supabase
    .from('scheduling_appointment_types')
    .select('id')
    .eq('is_active', true)
    .eq('church_id', churchId)
    .ilike('name', '%connect%')
    .limit(1)
    .maybeSingle();

  const flowResult = await createFlow(supabase, {
    name: 'Encounter Connect Journey',
    description: 'Default new-guest journey: videos → assessments → first meeting.',
    is_default: false,
    church_id: churchId,
  });
  if (!flowResult.success) return { ok: false, error: flowResult.error };
  const flow = flowResult.data;

  const steps: Array<Parameters<typeof createFlowStep>[1]> = [
    {
      flow_id: flow.id,
      title: 'Watch the welcome videos',
      description:
        'A short series introducing the church and what to expect on this journey.',
      step_type: 'video',
      order_index: 0,
      trigger_kind: 'signup',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flow.id,
      title: 'Personal Assessment',
      description: 'Tell us a bit about yourself.',
      step_type: 'assessment',
      assessment_kind: 'personal',
      order_index: 1,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flow.id,
      title: 'Connect with God Assessment',
      description: 'Reflect on where you are in your spiritual journey.',
      step_type: 'assessment',
      assessment_kind: 'connect_with_god',
      order_index: 2,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flow.id,
      title: 'Spiritual Gifts Assessment',
      description: 'Discover how you\'re wired to serve.',
      step_type: 'assessment',
      assessment_kind: 'spiritual_gifts',
      order_index: 3,
      trigger_kind: 'previous_complete',
      output_kind: 'advance',
      is_required: true,
    },
    {
      flow_id: flow.id,
      title: 'Schedule your first meeting',
      description:
        'Pick a time to meet with one of our connectors. We\'ll match you with whoever\'s free at the time you choose.',
      step_type: 'schedule',
      appointment_type_id: apptType?.id,
      order_index: 4,
      trigger_kind: 'previous_complete',
      output_kind: 'auto_match_connector',
      is_required: true,
    },
  ];

  for (const step of steps) {
    const result = await createFlowStep(supabase, step);
    if (!result.success) {
      return {
        ok: false,
        error: `Step "${step.title}" failed: ${result.error}`,
        id: flow.id,
      };
    }
  }

  await recordAudit({
    action: 'flow.seed_default',
    entity_type: 'flow',
    entity_id: flow.id,
    metadata: { template: 'encounter_connect_default' },
  });

  revalidatePath('/flows');
  return { ok: true, id: flow.id };
}

/**
 * Server-action wrapper for the "Use template" button on /flows/new.
 * Seeds the flow, then redirects to its editor.
 */
export async function seedAndOpenEncounterConnectFlow() {
  const result = await seedEncounterConnectFlow();
  if (!result.ok || !result.id) {
    // We let the form action surface the error via redirect query string.
    redirect(`/flows/new?error=${encodeURIComponent(result.error ?? 'Seed failed')}`);
  }
  redirect(`/flows/${result.id}`);
}
