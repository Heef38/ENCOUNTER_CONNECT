'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/connector-teams/actions';

export interface ConnectorOption {
  id: string;
  name: string;
}

interface CampusOption {
  id: string;
  name: string;
}

interface Props {
  campuses: CampusOption[];
  connectors: ConnectorOption[];
  defaults?: {
    name?: string;
    campusId?: string | null;
    memberA?: string;
    memberB?: string;
    isActive?: boolean;
  };
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  showActive?: boolean;
}

export function TeamForm({
  campuses,
  connectors,
  defaults,
  action,
  submitLabel,
  showActive = false,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        router.push('/connectors/teams');
        router.refresh();
      }
      return result;
    },
    null,
  );

  if (connectors.length < 2) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-foreground">
        You need at least two active connectors who aren&apos;t already on a team.
        Add connectors first, then come back to pair them.
      </div>
    );
  }

  const memberSelects: Array<{ name: string; label: string; defaultValue?: string }> = [
    { name: 'connector_a', label: 'Connector 1', defaultValue: defaults?.memberA },
    { name: 'connector_b', label: 'Connector 2', defaultValue: defaults?.memberB },
  ];

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="name">Team name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name ?? ''}
          placeholder="e.g. The Johnsons"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {memberSelects.map((m) => (
          <div key={m.name}>
            <Label htmlFor={m.name}>{m.label}</Label>
            <select
              id={m.name}
              name={m.name}
              required
              defaultValue={m.defaultValue ?? ''}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
            >
              <option value="" disabled>
                — Select a connector —
              </option>
              {connectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="campus_id">
          Campus <span className="text-foreground-subtle">(optional)</span>
        </Label>
        <select
          id="campus_id"
          name="campus_id"
          defaultValue={defaults?.campusId ?? ''}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">— None —</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {showActive && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={defaults?.isActive ?? true}
            className="h-4 w-4 rounded border-border"
          />
          Active (offered when participants book a meeting)
        </label>
      )}

      <p className="text-xs text-foreground-subtle">
        The team shares one availability calendar. Either member can set it from
        their own “My availability” page after the team is created.
      </p>

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
