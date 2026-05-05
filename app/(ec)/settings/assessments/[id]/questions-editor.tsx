'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type {
  AssessmentQuestion,
  AssessmentCategory,
  QuestionType,
} from '@/lib/assessments/types';
import type { ActionResult } from '@/lib/assessments/actions';

const TYPES: { value: QuestionType; label: string }[] = [
  { value: 'text',         label: 'Short text' },
  { value: 'long_text',    label: 'Long text' },
  { value: 'scale',        label: 'Scale (1–5)' },
  { value: 'choice',       label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
  { value: 'boolean',      label: 'Yes / No' },
];

const TYPE_LABEL: Record<QuestionType, string> = TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<QuestionType, string>,
);

const NEEDS_OPTIONS: QuestionType[] = ['choice', 'multi_choice'];

interface Props {
  questions: AssessmentQuestion[];
  categories: AssessmentCategory[];
  createAction: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  updateAction: (
    questionId: string,
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  deleteAction: (questionId: string) => Promise<ActionResult>;
}

export function QuestionsEditor({
  questions,
  categories,
  createAction,
  updateAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(questions.length === 0);

  return (
    <div className="space-y-3">
      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
          No questions yet. Add your first one below.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              categories={categories}
              expanded={openId === q.id}
              onToggle={() => setOpenId(openId === q.id ? null : q.id)}
              updateAction={updateAction}
              deleteAction={deleteAction}
              onSaved={() => {
                setOpenId(null);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {showNew ? (
        <NewQuestionForm
          orderHint={
            questions.length > 0
              ? Math.max(...questions.map((q) => q.order_index)) + 1
              : 0
          }
          categories={categories}
          createAction={createAction}
          onSaved={() => {
            setShowNew(false);
            router.refresh();
          }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          Add question
        </Button>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  categories,
  expanded,
  onToggle,
  updateAction,
  deleteAction,
  onSaved,
}: {
  question: AssessmentQuestion;
  categories: AssessmentCategory[];
  expanded: boolean;
  onToggle: () => void;
  updateAction: Props['updateAction'];
  deleteAction: Props['deleteAction'];
  onSaved: () => void;
}) {
  const [pendingDelete, startDelete] = useTransition();

  const boundUpdate = async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateAction(question.id, prev, formData);
    if (result.ok) onSaved();
    return result;
  };

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    boundUpdate,
    null,
  );

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted/60"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-foreground-subtle" />
        ) : (
          <ChevronRight className="h-4 w-4 text-foreground-subtle" />
        )}
        <span className="w-8 shrink-0 text-xs text-foreground-subtle">
          #{question.order_index}
        </span>
        <span className="flex-1 truncate text-sm text-foreground">
          {question.prompt}
        </span>
        <Badge tone="neutral">{TYPE_LABEL[question.question_type] ?? question.question_type}</Badge>
        {question.is_required && <Badge tone="warning">Required</Badge>}
      </button>

      {expanded && (
        <form action={formAction} className="space-y-4 border-t border-border bg-surface-muted/40 p-4">
          <QuestionFields question={question} categories={categories} />

          {state && !state.ok && state.error && (
            <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pendingDelete}
              onClick={() => {
                if (!confirm('Delete this question?')) return;
                startDelete(async () => {
                  await deleteAction(question.id);
                  onSaved();
                });
              }}
            >
              <Trash2 className="h-4 w-4 text-danger" />
              Delete
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Save question'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function NewQuestionForm({
  orderHint,
  categories,
  createAction,
  onSaved,
  onCancel,
}: {
  orderHint: number;
  categories: AssessmentCategory[];
  createAction: Props['createAction'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const wrapped = async (prev: ActionResult | null, formData: FormData) => {
    const result = await createAction(prev, formData);
    if (result.ok) onSaved();
    return result;
  };
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    wrapped,
    null,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">New question</h3>
      <QuestionFields orderHint={orderHint} categories={categories} />

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add question'}
        </Button>
      </div>
    </form>
  );
}

function optionsToText(options: unknown): string {
  if (!Array.isArray(options)) return '';
  return options
    .map((o) => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object') {
        const obj = o as Record<string, unknown>;
        const label = String(obj.label ?? obj.value ?? '');
        const points = obj.points ?? obj.score;
        if (points === undefined || points === null || points === 1) return label;
        return `${label} | ${points}`;
      }
      return String(o);
    })
    .join('\n');
}

function QuestionFields({
  question,
  categories,
  orderHint,
}: {
  question?: AssessmentQuestion;
  categories: AssessmentCategory[];
  orderHint?: number;
}) {
  const [type, setType] = useState<QuestionType>(question?.question_type ?? 'text');
  const optionsText = optionsToText(question?.options);
  const isScoreable = type !== 'text' && type !== 'long_text';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          name="prompt"
          rows={2}
          required
          defaultValue={question?.prompt ?? ''}
          placeholder="What is your name?"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="question_type">Type</Label>
          <select
            id="question_type"
            name="question_type"
            value={type}
            onChange={(e) => setType(e.target.value as QuestionType)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category_id">Category</Label>
          <select
            id="category_id"
            name="category_id"
            defaultValue={question?.category_id ?? ''}
            disabled={!isScoreable}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
          >
            <option value="">— Unscored —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {!isScoreable && (
            <p className="text-xs text-foreground-subtle">
              Text-style questions don&apos;t contribute to scoring.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="weight">Weight</Label>
          <Input
            id="weight"
            name="weight"
            type="number"
            min={0}
            step="0.5"
            disabled={!isScoreable}
            defaultValue={question?.weight ?? 1}
            className="disabled:opacity-50"
          />
          <p className="text-xs text-foreground-subtle">
            Multiplier on the answer&apos;s raw points.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order_index">Order</Label>
          <Input
            id="order_index"
            name="order_index"
            type="number"
            min={0}
            defaultValue={question?.order_index ?? orderHint ?? 0}
          />
        </div>
        <div className="flex items-end">
          <div className="flex items-center gap-2">
            <input
              id="is_required"
              name="is_required"
              type="checkbox"
              defaultChecked={question?.is_required ?? true}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="is_required" className="cursor-pointer">
              Required
            </Label>
          </div>
        </div>
      </div>

      {NEEDS_OPTIONS.includes(type) && (
        <div className="space-y-1.5">
          <Label htmlFor="options">Options</Label>
          <Textarea
            id="options"
            name="options"
            rows={5}
            defaultValue={optionsText}
            placeholder={'Strongly Agree | 5\nAgree | 4\nNeutral | 3\nDisagree | 2\nStrongly Disagree | 1'}
            className="font-mono text-xs"
          />
          <p className="text-xs text-foreground-subtle">
            One per line. Add <code className="rounded bg-surface-muted px-1">| points</code> after a label to set its point value (defaults to 1).
          </p>
        </div>
      )}
    </div>
  );
}
