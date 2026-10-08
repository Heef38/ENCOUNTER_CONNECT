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
  /** Groups a lesson can be limited to. */
  groups?: Array<{ id: string; name: string }>;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function LessonForm({
  lesson,
  groups = [],
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="purpose">What is it for?</Label>
          <select
            id="purpose"
            name="purpose"
            defaultValue={lesson?.purpose ?? 'general'}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="general">Anyone at the church</option>
            <option value="host_orientation">Host orientation (unlocks hosting)</option>
            <option value="connector">Connectors</option>
            <option value="leader">Group leaders</option>
            <option value="journey">Part of a journey</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minutes">Minutes (optional)</Label>
          <Input id="minutes" name="minutes" type="number" min={1} max={240} defaultValue={lesson?.minutes ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audience_group_id">Only for a group (optional)</Label>
          <select
            id="audience_group_id"
            name="audience_group_id"
            defaultValue={lesson?.audience_group_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">Everyone</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="summary">One-line summary (shown in Learn)</Label>
        <Input id="summary" name="summary" defaultValue={lesson?.summary ?? ''} maxLength={240} />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" name="in_library" defaultChecked={lesson?.in_library ?? true} />
        Show in the Learn library
      </label>

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
        <Label htmlFor="body">Body</Label>
        <Textarea
          id="body"
          name="body"
          rows={14}
          defaultValue={lesson?.body ?? ''}
          placeholder="Write it the way you'd say it. Blank lines start new paragraphs; lines starting with - become a list."
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
