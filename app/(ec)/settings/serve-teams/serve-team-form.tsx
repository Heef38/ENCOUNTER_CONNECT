'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ServeTeam } from '@/lib/serve-teams/types';
import type { ActionResult } from '@/lib/serve-teams/actions';

interface CampusOption {
  id: string;
  name: string;
}

interface LeaderOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  team?: ServeTeam;
  campuses: CampusOption[];
  leaders: LeaderOption[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function ServeTeamForm({
  team,
  campuses,
  leaders,
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
          <Label htmlFor="name">Team name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={team?.name ?? ''}
            placeholder="Hospitality"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campus_id">Campus</Label>
          <select
            id="campus_id"
            name="campus_id"
            defaultValue={team?.campus_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— All campuses —</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leader_profile_id">Leader</Label>
          <select
            id="leader_profile_id"
            name="leader_profile_id"
            defaultValue={team?.leader_profile_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— Unassigned —</option>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.first_name} {l.last_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={team?.is_active ?? true}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={team?.description ?? ''}
          placeholder="What this team does and what kind of people fit it well."
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
