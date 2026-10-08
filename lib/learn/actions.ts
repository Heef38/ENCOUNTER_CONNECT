'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { ServiceResult } from '@/lib/events/types';

/**
 * Mark a lesson finished (or not). RLS: you mark your own, and only lessons
 * you can read. Finishing the host orientation is one of the two things
 * that open up hosting (ec_can_host_events, migration 034).
 */
export async function setLessonComplete(lessonId: string, done: boolean): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { error } = done
    ? await supabase
        .from('lesson_completions')
        .upsert({ lesson_id: lessonId, profile_id: session.id }, { onConflict: 'lesson_id,profile_id', ignoreDuplicates: true })
    : await supabase.from('lesson_completions').delete().eq('lesson_id', lessonId).eq('profile_id', session.id);
  if (error) return { success: false, error: error.message };
  if (done) await recordAudit({ action: 'lesson.completed', entity_type: 'lesson', entity_id: lessonId });
  revalidatePath('/learn');
  revalidatePath('/hub/host');
  return { success: true, data: null };
}
