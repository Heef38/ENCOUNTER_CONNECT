'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Flow } from '@/lib/flows/types';
import { updateFlowDetails } from '@/lib/flows/flow-actions';

interface CampusOption {
  id: string;
  name: string;
}

interface Props {
  flow: Flow & { campus?: { id: string; name: string } | null };
  campuses: CampusOption[];
}

export function EditFlowDetails({ flow, campuses }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateFlowDetails(flow.id, new FormData(e.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Save failed.');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {flow.name}
            </h1>
            {flow.is_default && <Badge tone="info">Default</Badge>}
            {flow.campus && <Badge tone="neutral">{flow.campus.name}</Badge>}
          </div>
          {flow.description && (
            <p className="mt-1 text-sm text-foreground-muted">{flow.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={flow.is_active ? 'success' : 'neutral'}>
            {flow.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
            aria-label="Edit flow"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border-2 border-primary bg-primary/5 p-4"
    >
      <div>
        <Label htmlFor="name">
          Flow name <span className="text-danger">*</span>
        </Label>
        <Input id="name" name="name" required defaultValue={flow.name} autoFocus />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={flow.description ?? ''}
        />
      </div>

      <div>
        <Label htmlFor="campus_id">Campus</Label>
        <select
          id="campus_id"
          name="campus_id"
          defaultValue={flow.campus_id ?? ''}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">— All campuses (church-wide) —</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-foreground-muted">
          Leave unset to make this the church-wide flow. Pick a campus to make it
          campus-specific — that campus will use this flow instead of the
          church-wide default.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-foreground-muted">
          <input
            type="checkbox"
            name="is_default"
            defaultChecked={flow.is_default}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          Default flow
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground-muted">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={flow.is_active}
            className="h-3.5 w-3.5 rounded border-border accent-primary"
          />
          Active
        </label>
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => { setEditing(false); setError(null); }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
