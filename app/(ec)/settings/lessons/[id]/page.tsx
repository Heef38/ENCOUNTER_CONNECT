import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { updateLesson, deleteLesson } from '@/lib/lessons/actions';
import { LessonForm } from '../lesson-form';
import { DeleteButton } from './delete-button';
import type { Lesson } from '@/lib/lessons/types';

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();
  const lesson = data as Lesson;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateLesson(id, formData);
  }

  async function destroy() {
    'use server';
    await deleteLesson(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/lessons"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Lessons
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit lesson
          </h1>
        </div>
        <DeleteButton action={destroy} />
      </div>

      <LessonForm
        lesson={lesson}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/settings/lessons"
      />
    </div>
  );
}
