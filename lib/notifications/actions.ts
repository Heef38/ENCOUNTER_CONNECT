'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { NotificationChannel } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const VALID_CHANNELS: NotificationChannel[] = ['email', 'sms'];

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

export async function createTemplate(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const key = String(formData.get('key') ?? '').trim();
  if (!key) return { ok: false, error: 'Key is required.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const channelRaw = String(formData.get('channel') ?? 'email');
  const channel: NotificationChannel = (
    VALID_CHANNELS.includes(channelRaw as NotificationChannel) ? channelRaw : 'email'
  ) as NotificationChannel;

  const subject = nullable(formData.get('subject'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { ok: false, error: 'Body is required.' };
  const is_active = formData.get('is_active') !== 'off';

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      church_id: churchId,
      key,
      name,
      channel,
      subject,
      body,
      is_active,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'notification_template.create',
    entity_type: 'notification_template',
    entity_id: data.id,
    metadata: { key, channel },
  });

  revalidatePath('/settings/notifications');
  return { ok: true, id: data.id };
}

export async function updateTemplate(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const key = String(formData.get('key') ?? '').trim();
  if (!key) return { ok: false, error: 'Key is required.' };
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const channelRaw = String(formData.get('channel') ?? 'email');
  const channel: NotificationChannel = (
    VALID_CHANNELS.includes(channelRaw as NotificationChannel) ? channelRaw : 'email'
  ) as NotificationChannel;

  const subject = nullable(formData.get('subject'));
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return { ok: false, error: 'Body is required.' };
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('notification_templates')
    .update({ key, name, channel, subject, body, is_active })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'notification_template.update',
    entity_type: 'notification_template',
    entity_id: id,
    metadata: { key, channel },
  });

  revalidatePath('/settings/notifications');
  revalidatePath(`/settings/notifications/${id}`);
  return { ok: true, id };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('notification_templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'notification_template.delete',
    entity_type: 'notification_template',
    entity_id: id,
  });

  revalidatePath('/settings/notifications');
  return { ok: true };
}

/** Reads a checkbox: present (any value) = true, absent = false. */
function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

/** Reads a positive-integer day field, clamped to >= 1, with a fallback. */
function dayField(formData: FormData, name: string, fallback: number): number {
  const raw = Number.parseInt(String(formData.get(name) ?? ''), 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : fallback;
}

export async function updateNotificationSettings(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const first = dayField(formData, 'stale_first_reminder_days', 3);
  const second = dayField(formData, 'stale_second_reminder_days', 7);

  const row = {
    church_id: churchId,
    step_complete_to_connector_enabled: checkbox(formData, 'step_complete_to_connector_enabled'),
    meeting_scheduled_enabled: checkbox(formData, 'meeting_scheduled_enabled'),
    meeting_decision_enabled: checkbox(formData, 'meeting_decision_enabled'),
    meeting_notes_enabled: checkbox(formData, 'meeting_notes_enabled'),
    stale_reminders_enabled: checkbox(formData, 'stale_reminders_enabled'),
    availability_reminders_enabled: checkbox(formData, 'availability_reminders_enabled'),
    stale_first_reminder_days: first,
    stale_second_reminder_days: second,
    availability_reminder_horizon_days: dayField(formData, 'availability_reminder_horizon_days', 14),
    availability_reminder_interval_days: dayField(formData, 'availability_reminder_interval_days', 7),
  };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('notification_settings')
    .upsert(row, { onConflict: 'church_id' });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'notification_settings.update',
    entity_type: 'notification_settings',
    entity_id: churchId,
    metadata: row,
  });

  revalidatePath('/settings/notifications');
  return { ok: true };
}
