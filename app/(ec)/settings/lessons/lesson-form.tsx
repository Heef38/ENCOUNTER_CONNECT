'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Lesson } from '@/lib/lessons/types';
import type { ActionResult } from '@/lib/lessons/actions';

interface Props {
  lesson?: Lesson;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function LessonForm({
  lesson,
  action,
  submitLabel,
  redirectOnSuccess,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok && redirectOnSuccess) {
        router.push(redirectOnSuccess);
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={lesson?.title ?? ''}
            placeholder="Welcome to the journey"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug (optional)</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={lesson?.slug ?? ''}
            placeholder="auto-generated from title"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order_index">Order</Label>
          <Input
            id="order_index"
            name="order_index"
            type="number"
            defaultValue={lesson?.order_index ?? 0}
            min={0}
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            id="is_published"
            name="is_published"
            type="checkbox"
            defaultChecked={lesson?.is_published ?? true}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_published" className="cursor-pointer">
            Published
          </Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="video_url">Video URL (optional)</Label>
        <Input
          id="video_url"
          name="video_url"
          type="url"
          defaultValue={lesson?.video_url ?? ''}
          placeholder="https://www.youtube.com/watch?v=…"
        />
        <p className="text-xs text-foreground-subtle">
          YouTube links auto-embed. Other URLs render as a link out.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body (Markdown)</Label>
        <Textarea
          id="body"
          name="body"
          rows={14}
          defaultValue={lesson?.body ?? ''}
          placeholder="Write the lesson content in Markdown…"
          className="font-mono text-xs"
        />
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
