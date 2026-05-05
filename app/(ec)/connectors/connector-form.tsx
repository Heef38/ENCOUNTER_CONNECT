'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/connectors/actions';

interface ProfileOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

interface CampusOption {
  id: string;
  name: string;
}

interface ResourceOption {
  id: string;
  name: string;
}

interface Props {
  profiles?: ProfileOption[];
  currentProfile?: ProfileOption | null;
  campuses: CampusOption[];
  resources: ResourceOption[];
  defaults?: {
    campus_id?: string | null;
    scheduling_resource_id?: string | null;
    is_active?: boolean;
  };
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function ConnectorForm({
  profiles,
  currentProfile,
  campuses,
  resources,
  defaults,
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
        {profiles ? (
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="profile_id">Person</Label>
            <select
              id="profile_id"
              name="profile_id"
              required
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
              defaultValue=""
            >
              <option value="" disabled>— Select a person —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                  {p.email ? ` · ${p.email}` : ''}
                </option>
              ))}
            </select>
            {profiles.length === 0 && (
              <p className="text-xs text-foreground-subtle">
                Everyone in this church is already a connector. Add a new staff profile first.
              </p>
            )}
          </div>
        ) : (
          currentProfile && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Person</Label>
              <div className="rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {currentProfile.first_name} {currentProfile.last_name}
                </span>
                {currentProfile.email && (
                  <span className="text-foreground-subtle"> · {currentProfile.email}</span>
                )}
              </div>
            </div>
          )
        )}

        <div className="space-y-1.5">
          <Label htmlFor="campus_id">Campus</Label>
          <select
            id="campus_id"
            name="campus_id"
            defaultValue={defaults?.campus_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— Any campus —</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="scheduling_resource_id">Scheduling resource</Label>
          <select
            id="scheduling_resource_id"
            name="scheduling_resource_id"
            defaultValue={defaults?.scheduling_resource_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— None —</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <p className="text-xs text-foreground-subtle">
            Optional. Lets the connector&apos;s availability drive bookings.
          </p>
        </div>

        <div className="flex items-end gap-2">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={defaults?.is_active ?? true}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
        </div>
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
