import 'server-only';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Lesson } from '@/lib/lessons/types';

export interface LibraryLesson extends Lesson {
  completed_at: string | null;
}

/** The Learn library: lessons this person can read (RLS), with their progress. */
export async function listLibrary(churchId: string, profileId: string): Promise<LibraryLesson[]> {
  const supabase = await createServerSupabaseClient();
  const [{ data: lessons }, { data: done }] = await Promise.all([
    supabase
      .from('lessons')
      .select('*')
      .eq('church_id', churchId)
      .eq('in_library', true)
      .eq('is_published', true)
      .order('order_index')
      .order('title'),
    supabase.from('lesson_completions').select('lesson_id, completed_at').eq('profile_id', profileId),
  ]);
  const doneAt = new Map(((done ?? []) as Array<{ lesson_id: string; completed_at: string }>).map((d) => [d.lesson_id, d.completed_at]));
  return ((lessons ?? []) as Lesson[]).map((l) => ({ ...l, completed_at: doneAt.get(l.id) ?? null }));
}

export async function getLibraryLesson(churchId: string, slugOrId: string, profileId: string): Promise<LibraryLesson | null> {
  const supabase = await createServerSupabaseClient();
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const { data } = await supabase
    .from('lessons')
    .select('*')
    .eq('church_id', churchId)
    .eq(isId ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  if (!data) return null;
  const { data: done } = await supabase
    .from('lesson_completions')
    .select('completed_at')
    .eq('lesson_id', (data as Lesson).id)
    .eq('profile_id', profileId)
    .maybeSingle();
  return { ...(data as Lesson), completed_at: (done as { completed_at: string } | null)?.completed_at ?? null };
}
