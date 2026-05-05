import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createLesson } from '@/lib/lessons/actions';
import { LessonForm } from '../lesson-form';

export default async function NewLessonPage() {
  await requireCampusAdmin();

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createLesson(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/lessons"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Lessons
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New lesson
        </h1>
      </div>

      <LessonForm
        action={action}
        submitLabel="Create lesson"
        redirectOnSuccess="/settings/lessons"
      />
    </div>
  );
}
