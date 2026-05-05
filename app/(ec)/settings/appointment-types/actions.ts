'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { isValidHex } from '@/lib/dashboard/colors';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function setAppointmentTypeColor(
  id: string,
  color: string | null,
): Promise<ActionResult> {
  await requireChurchAdmin();

  if (color !== null && !isValidHex(color)) {
    return { ok: false, error: 'Invalid color value.' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('scheduling_appointment_types')
    .update({ color })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/appointment-types');
  revalidatePath('/dashboard');
  return { ok: true };
}
