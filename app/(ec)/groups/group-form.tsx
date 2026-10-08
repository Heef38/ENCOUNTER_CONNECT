'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { createGroup, updateGroup } from '@/lib/groups/actions';
import type { GroupRow } from '@/lib/events/types';

const KINDS: Array<[GroupRow['kind'], string]> = [
  ['home_group', 'Home group'],
  ['ministry', 'Ministry'],
  ['serve', 'Serve team'],
  ['interest', 'Interest'],
  ['age_stage', 'Age or stage of life'],
  ['roster', 'Roster (a wider circle other groups belong to)'],
  ['custom', 'Something else'],
];

export function GroupForm({
  group,
  campuses,
  groups,
  people,
}: {
  group?: GroupRow;
  campuses: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const select = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = group ? await updateGroup(group.id, fd) : await createGroup(fd);
      if (r.success) {
        router.push(`/groups/${r.data.id}`);
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <form action={submit} className="space-y-6">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={group?.name ?? ''} maxLength={120} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="kind">Kind</Label>
            <select id="kind" name="kind" defaultValue={group?.kind ?? 'home_group'} className={select}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <textarea id="description" name="description" defaultValue={group?.description ?? ''} rows={3} className={select} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="leader">Leader</Label>
              <select id="leader" name="leader_profile_id" defaultValue={group?.leader_profile_id ?? ''} className={select}>
                <option value="">No leader yet</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {campuses.length > 1 && (
              <div>
                <Label htmlFor="campus">Campus</Label>
                <select id="campus" name="campus_id" defaultValue={group?.campus_id ?? ''} className={select}>
                  <option value="">Any campus</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="parent">Part of a wider circle? (optional)</Label>
            <select id="parent" name="parent_group_id" defaultValue={group?.parent_group_id ?? ''} className={select}>
              <option value="">No</option>
              {groups
                .filter((g) => g.id !== group?.id)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-foreground-subtle">
              A host can open a gathering to this wider circle so people who might be left out can come. For example,
              Women&apos;s Ministry inside Women.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" name="is_private" defaultChecked={group?.is_private ?? false} className="mt-0.5" />
            <span>
              Private group
              <span className="block text-xs text-foreground-muted">Only members and staff know it exists.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" name="is_youth" defaultChecked={group?.is_youth ?? false} className="mt-0.5" />
            <span>
              Youth group (minors)
              <span className="block text-xs text-foreground-muted">
                Its gatherings stay private, share their address only with people going, and need a staff host. It never
                shows in the group directory.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : group ? 'Save' : 'Create group'}
        </Button>
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
