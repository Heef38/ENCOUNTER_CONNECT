'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { drainNotificationOutbox } from './drain';

export interface DrainActionResult {
  ok: boolean;
  error?: string;
  scanned?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
}

/**
 * Manually triggers a drain of the notification outbox. Handy for testing
 * provider configuration without waiting for the cron interval.
 */
export async function drainOutboxNow(): Promise<DrainActionResult> {
  await requireCampusAdmin();

  const admin = await createServiceRoleClient();
  try {
    const report = await drainNotificationOutbox(admin);
    revalidatePath('/settings/notifications');
    return {
      ok: true,
      scanned: report.scanned,
      sent: report.sent,
      failed: report.failed,
      skipped: report.skipped,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Drain failed.',
    };
  }
}

/**
 * Permanently removes an outbox row. Church-scoped (platform admins may
 * delete any). Used by the queue viewer to clear unwanted/stuck messages.
 */
export async function deleteOutboxRow(id: string): Promise<DrainActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id ?? null;

  const admin = await createServiceRoleClient();
  let q = admin.from('notification_outbox').delete().eq('id', id);
  if (churchId) q = q.eq('church_id', churchId);
  const { error } = await q;

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/notifications');
  return { ok: true };
}

/**
 * Resets a `failed` outbox row back to `pending` so it'll be retried on
 * the next drain.
 */
export async function requeueFailedNotification(id: string): Promise<DrainActionResult> {
  await requireCampusAdmin();

  const admin = await createServiceRoleClient();
  const { error } = await admin
    .from('notification_outbox')
    .update({ status: 'pending', error: null })
    .eq('id', id)
    .eq('status', 'failed');

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/notifications');
  return { ok: true };
}
