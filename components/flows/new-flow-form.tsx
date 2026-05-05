'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CampusOption {
  id: string;
  name: string;
}

export function NewFlowForm({ campuses = [] }: { campuses?: CampusOption[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const campusId = (form.get('campus_id') as string) || undefined;
    const body = {
      name:        form.get('name') as string,
      description: (form.get('description') as string) || undefined,
      is_default:  form.get('is_default') === 'on',
      campus_id:   campusId,
    };

    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.');
      } else {
        router.push(`/flows/${json.id}`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div>
        <Label htmlFor="name">
          Flow name <span className="text-danger">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          placeholder="e.g. New Guest Journey"
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="What is this flow for?"
        />
      </div>

      <div>
        <Label htmlFor="campus_id">Campus</Label>
        <select
          id="campus_id"
          name="campus_id"
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">— All campuses (church-wide) —</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-foreground-muted">
          Pick a campus to make this flow campus-specific. Leave blank for a
          church-wide flow.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="is_default"
          name="is_default"
          type="checkbox"
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <label htmlFor="is_default" className="text-sm text-foreground-muted">
          Set as default flow
        </label>
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create Flow'}
        </Button>
        <Link href="/flows">
          <Button type="button" variant="outline">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
