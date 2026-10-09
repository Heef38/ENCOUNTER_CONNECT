'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireChurchAdmin, requirePlatformAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { CHURCH_AGREEMENT_VERSION } from './agreement';

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

function int(fd: FormData, key: string, min: number, max: number, fallback: number): number {
  const n = parseInt(String(fd.get(key) ?? ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? '').trim();
  return v ? v : null;
}

/**
 * A church admin's settings for their own church.
 *
 * church_settings goes through the admin's own client (RLS: church admins
 * of that church). The few church-row fields a church owns about itself —
 * its connect name, public description, and whether it is listed on the
 * shared map — go through a narrow service-role update for exactly those
 * columns, because the churches table is otherwise platform-only (who is
 * verified, active, or named what in the URL stays with the platform).
 */
export async function saveChurchSettings(_prev: SettingsResult | null, formData: FormData): Promise<SettingsResult> {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const connectName = text(formData, 'connect_name');
  if (connectName && (connectName.length < 3 || connectName.length > 60)) {
    return { ok: false, error: 'Keep the connect name between 3 and 60 characters.' };
  }
  const journeyMode = text(formData, 'journey_mode');
  const senderMode = text(formData, 'sms_sender_mode') === 'own' ? 'own' : 'platform';
  const fromNumber = text(formData, 'sms_from_number');
  const serviceSid = text(formData, 'sms_messaging_service_sid');
  if (senderMode === 'own' && !fromNumber && !serviceSid) {
    return { ok: false, error: 'To text from your own line, add its number or Messaging Service SID.' };
  }
  if (fromNumber && !/^\+[1-9]\d{6,14}$/.test(fromNumber)) {
    return { ok: false, error: 'Enter the number in international format, like +14325551234.' };
  }
  if (serviceSid && !/^MG[0-9a-fA-F]{32}$/.test(serviceSid)) {
    return { ok: false, error: 'A Messaging Service SID starts with MG followed by 32 characters.' };
  }

  const settings = {
    allow_public_home_events: formData.get('allow_public_home_events') === 'on',
    require_host_orientation: formData.get('require_host_orientation') === 'on',
    journey_mode: journeyMode && ['encounter', 'simple', 'custom', 'none'].includes(journeyMode) ? journeyMode : null,
    contact_within_days: int(formData, 'contact_within_days', 1, 60, 7),
    plugged_in_within_days: int(formData, 'plugged_in_within_days', 7, 180, 30),
    admin_escalation_days: int(formData, 'admin_escalation_days', 1, 14, 3),
    digest_enabled: formData.get('digest_enabled') === 'on',
    digest_day_of_week: int(formData, 'digest_day_of_week', 0, 6, 1),
    sms_sender_mode: senderMode,
    sms_from_number: fromNumber,
    sms_messaging_service_sid: serviceSid,
    updated_by: session.id,
  };

  const supabase = await createServerSupabaseClient();
  const { data: saved, error } = await supabase
    .from('church_settings')
    .update(settings)
    .eq('church_id', churchId)
    .select('church_id');
  if (error) return { ok: false, error: error.message };
  if (!saved || saved.length === 0) return { ok: false, error: 'Only a church admin can change these settings.' };

  const admin = await createServiceRoleClient();
  const { error: churchErr } = await admin
    .from('churches')
    .update({
      connect_name: connectName,
      description: text(formData, 'description'),
      service_times: text(formData, 'service_times')?.slice(0, 500) ?? null,
      listed_on_map: formData.get('listed_on_map') === 'on',
    })
    .eq('id', churchId);
  if (churchErr) {
    return {
      ok: false,
      error: churchErr.code === '23505' ? 'Another church already uses that connect name.' : churchErr.message,
    };
  }

  await recordAudit({
    action: 'church.settings_update',
    entity_type: 'church',
    entity_id: churchId,
    metadata: { ...settings, connect_name: connectName, listed_on_map: formData.get('listed_on_map') === 'on' },
  });
  revalidatePath('/settings/church');
  revalidatePath('/');
  return { ok: true };
}

/** Platform admin: verified churches can appear on the shared map. */
export async function setChurchVerified(churchId: string, verified: boolean): Promise<SettingsResult> {
  const session = await requirePlatformAdmin();
  const admin = await createServiceRoleClient();
  const { error } = await admin
    .from('churches')
    .update({ verified_at: verified ? new Date().toISOString() : null, verified_by: verified ? session.id : null })
    .eq('id', churchId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ action: verified ? 'church.verified' : 'church.unverified', entity_type: 'church', entity_id: churchId });
  revalidatePath(`/platform/churches/${churchId}`);
  return { ok: true };
}

/** A church admin accepts the church agreement for their church. */
export async function acceptChurchAgreement(): Promise<SettingsResult> {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('church_settings')
    .update({
      agreement_version: CHURCH_AGREEMENT_VERSION,
      agreement_accepted_at: new Date().toISOString(),
      agreement_accepted_by: session.id,
    })
    .eq('church_id', churchId)
    .select('church_id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Only a church admin can accept the agreement.' };
  await recordAudit({
    action: 'church.agreement_accepted',
    entity_type: 'church',
    entity_id: churchId,
    metadata: { version: CHURCH_AGREEMENT_VERSION },
  });
  revalidatePath('/settings/church');
  return { ok: true };
}
