'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AssessmentCategory } from '@/lib/assessments/types';
import type { ActionResult } from '@/lib/assessments/actions';

interface Props {
  categories: AssessmentCategory[];
  createAction: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  updateAction: (
    categoryId: string,
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  deleteAction: (categoryId: string) => Promise<ActionResult>;
}

export function CategoriesEditor({
  categories,
  createAction,
  updateAction,
  deleteAction,
}: Props) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(categories.length === 0);

  return (
    <div className="space-y-3">
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
          No categories yet. Add at least three so participants can be ranked.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              expanded={openId === c.id}
              onToggle={() => setOpenId(openId === c.id ? null : c.id)}
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
        <NewCategoryForm
          orderHint={
            categories.length > 0
              ? Math.max(...categories.map((c) => c.order_index)) + 1
              : 0
          }
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
          Add category
        </Button>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  expanded,
  onToggle,
  updateAction,
  deleteAction,
  onSaved,
}: {
  category: AssessmentCategory;
  expanded: boolean;
  onToggle: () => void;
  updateAction: Props['updateAction'];
  deleteAction: Props['deleteAction'];
  onSaved: () => void;
}) {
  const [pendingDelete, startDelete] = useTransition();

  const boundUpdate = async (prev: ActionResult | null, formData: FormData) => {
    const result = await updateAction(category.id, prev, formData);
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
          #{category.order_index}
        </span>
        <span className="flex-1 truncate text-sm font-medium text-foreground">
          {category.label}
        </span>
        <span className="font-mono text-[11px] text-foreground-subtle">
          {category.key}
        </span>
      </button>

      {expanded && (
        <form action={formAction} className="space-y-4 border-t border-border bg-surface-muted/40 p-4">
          <CategoryFields category={category} />

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
                if (!confirm('Delete this category? Questions assigned to it will be unassigned.')) return;
                startDelete(async () => {
                  await deleteAction(category.id);
                  onSaved();
                });
              }}
            >
              <Trash2 className="h-4 w-4 text-danger" />
              Delete
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : 'Save category'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function NewCategoryForm({
  orderHint,
  createAction,
  onSaved,
  onCancel,
}: {
  orderHint: number;
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
      <h3 className="text-sm font-semibold text-foreground">New category</h3>
      <CategoryFields orderHint={orderHint} />

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
          {pending ? 'Adding…' : 'Add category'}
        </Button>
      </div>
    </form>
  );
}

function CategoryFields({
  category,
  orderHint,
}: {
  category?: AssessmentCategory;
  orderHint?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            name="label"
            required
            defaultValue={category?.label ?? ''}
            placeholder="Through Movement & Exercise"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="key">Key (auto)</Label>
          <Input
            id="key"
            name="key"
            defaultValue={category?.key ?? ''}
            placeholder="auto-generated"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          defaultValue={category?.description ?? ''}
          placeholder="Short summary shown next to the score."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body (Markdown)</Label>
        <Textarea
          id="body"
          name="body"
          rows={10}
          defaultValue={category?.body ?? ''}
          placeholder="The pre-written content that gets shown when this category is in the participant's top results."
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="order_index">Order</Label>
        <Input
          id="order_index"
          name="order_index"
          type="number"
          min={0}
          defaultValue={category?.order_index ?? orderHint ?? 0}
          className="max-w-[120px]"
        />
      </div>
    </div>
  );
}
