'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConnectDoc, DocVisibility } from '@/lib/connect-docs/types';
import type { ActionResult } from '@/lib/connect-docs/actions';

interface CampusOption {
  id: string;
  name: string;
}

interface Props {
  doc?: ConnectDoc;
  campuses: CampusOption[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

const VISIBILITIES: { value: DocVisibility; label: string; hint: string }[] = [
  { value: 'staff',        label: 'Staff only',  hint: 'Connectors and admins.' },
  { value: 'participants', label: 'Participants', hint: 'Visible to anyone authenticated in your church.' },
  { value: 'public',       label: 'Public',       hint: 'Visible to anyone authenticated.' },
];

export function ConnectDocForm({
  doc,
  campuses,
  action,
  submitLabel,
  redirectOnSuccess,
}: Props) {
  const router = useRouter();
  // file_url holds either an external link or a private storage path; only
  // external links belong in the URL input.
  const isExternal = !!doc?.file_url && /^https?:\/\//i.test(doc.file_url);
  const hasStoredFile = !!doc?.file_url && !isExternal;
  const externalUrl = isExternal ? doc!.file_url! : '';
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
            defaultValue={doc?.title ?? ''}
            placeholder="New member welcome"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campus_id">Campus</Label>
          <select
            id="campus_id"
            name="campus_id"
            defaultValue={doc?.campus_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— All campuses —</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visibility">Visibility</Label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={doc?.visibility ?? 'staff'}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            {VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
          <p className="text-xs text-foreground-subtle">
            {VISIBILITIES.find((v) => v.value === (doc?.visibility ?? 'staff'))?.hint}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={doc?.is_active ?? true}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          defaultValue={doc?.description ?? ''}
          placeholder="Short summary shown in lists."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="file">Upload a file (optional)</Label>
          <Input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.webp"
            className="h-auto py-1.5"
          />
          <p className="text-xs text-foreground-subtle">
            Stored privately — only people in your church can open it. Replaces
            any current upload.
          </p>
          {hasStoredFile && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                name="remove_file"
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              A file is attached — check to remove it
            </label>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="file_url">…or link a URL</Label>
          <Input
            id="file_url"
            name="file_url"
            type="url"
            defaultValue={externalUrl}
            placeholder="https://…"
          />
          <p className="text-xs text-foreground-subtle">
            External resource link. An uploaded file takes priority over this.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Body (Markdown)</Label>
        <Textarea
          id="body"
          name="body"
          rows={10}
          defaultValue={doc?.body ?? ''}
          placeholder="Long-form content in Markdown…"
          className="font-mono text-xs"
        />
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
