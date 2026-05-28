'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import {
  createAppointmentType,
  updateAppointmentType,
} from '@/lib/scheduling/services/appointment-types';
import type { CreateAppointmentTypeInput, UpdateAppointmentTypeInput } from '@/lib/scheduling/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? '').trim();
}
function optInt(fd: FormData, key: string): number | undefined {
  const raw = String(fd.get(key) ?? '').trim();
  if (raw === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function buildInput(fd: FormData): CreateAppointmentTypeInput | { error: string } {
  const name = text(fd, 'name');
  if (!name) return { error: 'Name is required.' };
  const duration = optInt(fd, 'duration_minutes') ?? 60;
  if (duration <= 0) return { error: 'Duration must be greater than 0.' };

  return {
    name,
    description: text(fd, 'description') || undefined,
    duration_minutes: duration,
    buffer_before_minutes: optInt(fd, 'buffer_before_minutes') ?? 0,
    buffer_after_minutes: optInt(fd, 'buffer_after_minutes') ?? 0,
    min_notice_hours: optInt(fd, 'min_notice_hours') ?? 24,
    max_advance_days: optInt(fd, 'max_advance_days') ?? 90,
    requires_confirmation: fd.get('requires_confirmation') === 'on',
    is_public: fd.get('is_public') === 'on',
  };
}

export async function createApptType(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireChurchAdmin();
  const input = buildInput(formData);
  if ('error' in input) return { ok: false, error: input.error };

  const admin = await createServiceRoleClient();
  const result = await createAppointmentType(admin, input);
  if (!result.success) return { ok: false, error: result.error };

  await recordAudit({
    action: 'appointment_type.create',
    entity_type: 'scheduling_appointment_type',
    entity_id: result.data.id,
    metadata: { name: input.name },
  });

  revalidatePath('/settings/appointment-types');
  return { ok: true, id: result.data.id };
}

export async function updateApptType(
  id: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireChurchAdmin();
  const base = buildInput(formData);
  if ('error' in base) return { ok: false, error: base.error };

  const input: UpdateAppointmentTypeInput = {
    ...base,
    is_active: formData.get('is_active') === 'on',
  };

  const admin = await createServiceRoleClient();
  const result = await updateAppointmentType(admin, id, input);
  if (!result.success) return { ok: false, error: result.error };

  await recordAudit({
    action: 'appointment_type.update',
    entity_type: 'scheduling_appointment_type',
    entity_id: id,
    metadata: { name: input.name },
  });

  revalidatePath('/settings/appointment-types');
  revalidatePath(`/settings/appointment-types/${id}`);
  return { ok: true, id };
}
