'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { updateFlow } from './services';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Renames a flow and / or reassigns its campus scope. Empty `campus_id`
 * clears the scope so the flow becomes church-wide.
 */
export async function updateFlowDetails(
  flowId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const description = String(formData.get('description') ?? '').trim();
  const campusRaw = String(formData.get('campus_id') ?? '').trim();
  const isDefault = formData.get('is_default') === 'on';
  const isActive = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const result = await updateFlow(supabase, flowId, {
    name,
    description: description || undefined,
    campus_id: campusRaw || undefined,
    is_default: isDefault,
    is_active: isActive,
  });

  // updateFlow's UpdateFlowInput doesn't accept `null` for campus_id, so
  // when the admin clears the field we patch separately.
  if (result.success && !campusRaw) {
    await supabase.from('flows').update({ campus_id: null }).eq('id', flowId);
  }

  if (!result.success) return { ok: false, error: result.error };

  await recordAudit({
    action: 'flow.update',
    entity_type: 'flow',
    entity_id: flowId,
    metadata: { name, campus_id: campusRaw || null, is_default: isDefault, is_active: isActive },
  });

  revalidatePath('/flows');
  revalidatePath(`/flows/${flowId}`);
  return { ok: true };
}
