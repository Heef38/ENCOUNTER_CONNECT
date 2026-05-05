import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import {
  updateDefinition,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/lib/assessments/actions';
import { DefinitionForm } from './definition-form';
import { QuestionsEditor } from './questions-editor';
import { CategoriesEditor } from './categories-editor';
import type {
  AssessmentDefinition,
  AssessmentQuestion,
  AssessmentCategory,
  AssessmentKind,
} from '@/lib/assessments/types';

const KIND_LABELS: Record<AssessmentKind, string> = {
  personal:         'Personal Assessment',
  connect_with_god: 'Connect with God',
  spiritual_gifts:  'Spiritual Gifts',
};

export default async function AssessmentDefinitionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const [defResult, questionsResult, categoriesResult] = await Promise.all([
    supabase.from('assessment_definitions').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('assessment_questions')
      .select('*')
      .eq('assessment_id', id)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('assessment_categories')
      .select('*')
      .eq('assessment_id', id)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);

  if (!defResult.data) notFound();
  const definition = defResult.data as AssessmentDefinition;
  const questions = (questionsResult.data ?? []) as AssessmentQuestion[];
  const categories = (categoriesResult.data ?? []) as AssessmentCategory[];

  async function updateDef(_prev: unknown, formData: FormData) {
    'use server';
    return updateDefinition(id, formData);
  }
  async function addQuestion(_prev: unknown, formData: FormData) {
    'use server';
    return createQuestion(id, formData);
  }
  async function editQuestion(questionId: string, _prev: unknown, formData: FormData) {
    'use server';
    return updateQuestion(questionId, formData);
  }
  async function removeQuestion(questionId: string) {
    'use server';
    return deleteQuestion(questionId, id);
  }
  async function addCategory(_prev: unknown, formData: FormData) {
    'use server';
    return createCategory(id, formData);
  }
  async function editCategory(categoryId: string, _prev: unknown, formData: FormData) {
    'use server';
    return updateCategory(categoryId, formData);
  }
  async function removeCategory(categoryId: string) {
    'use server';
    return deleteCategory(categoryId, id);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/settings/assessments"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Assessments
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {KIND_LABELS[definition.kind]}
          </h1>
          {definition.is_active ? (
            <Badge tone="success">Active</Badge>
          ) : (
            <Badge tone="neutral">Inactive</Badge>
          )}
          <span className="text-xs text-foreground-subtle">v{definition.version}</span>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">Definition</h2>
        <DefinitionForm definition={definition} action={updateDef} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold text-foreground">
            Categories ({categories.length})
          </h2>
          <p className="text-xs text-foreground-subtle">
            The buckets a participant is scored against. Top three are shown in their results.
          </p>
        </div>
        <CategoriesEditor
          categories={categories}
          createAction={addCategory}
          updateAction={editCategory}
          deleteAction={removeCategory}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold text-foreground">
            Questions ({questions.length})
          </h2>
          <p className="text-xs text-foreground-subtle">
            Add questions and assign each one to a category to contribute toward scoring.
          </p>
        </div>
        <QuestionsEditor
          questions={questions}
          categories={categories}
          createAction={addQuestion}
          updateAction={editQuestion}
          deleteAction={removeQuestion}
        />
      </section>
    </div>
  );
}
