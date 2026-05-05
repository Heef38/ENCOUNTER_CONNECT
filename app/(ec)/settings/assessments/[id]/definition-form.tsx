'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AssessmentDefinition } from '@/lib/assessments/types';
import type { ActionResult } from '@/lib/assessments/actions';

interface Props {
  definition: AssessmentDefinition;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

export function DefinitionForm({ definition, action }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-border bg-surface p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={definition.name}
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={definition.is_active}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_active" className="cursor-pointer">
            Active
          </Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={definition.description ?? ''}
          placeholder="What this assessment helps you learn about a participant."
        />
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}
      {state && state.ok && (
        <div className="text-xs text-success">Saved.</div>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save definition'}
        </Button>
      </div>
    </form>
  );
}
