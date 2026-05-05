import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/dal';
import type { RecordAuditInput } from './types';

/**
 * Records an audit log entry for the current session's user.
 * Safe to call from any server action or route handler.
 * Swallows failures (logging shouldn't break the caller) but
 * surfaces them through console.error for observability.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const session = await getSession();
    if (!session) return;

    const supabase = await createServerSupabaseClient();
    const actorLabel = [session.profile?.first_name, session.profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || session.email;

    const { error } = await supabase.from('audit_log').insert({
      church_id: session.profile?.church_id ?? null,
      actor_id: session.id,
      actor_label: actorLabel,
      action: input.action,
      entity_type: input.entity_type ?? null,
      entity_id: input.entity_id ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error('[audit] insert failed:', error.message);
    }
  } catch (err) {
    console.error('[audit] unexpected error:', err);
  }
}
