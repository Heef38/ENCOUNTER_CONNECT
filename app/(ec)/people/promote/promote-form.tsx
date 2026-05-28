'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ECUserRole } from '@/lib/church/types';
import type { ActionResult } from '@/lib/people/actions';

interface ProfileOption {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: ECUserRole;
}

interface CampusOption {
  id: string;
  name: string;
}

interface Props {
  profiles: ProfileOption[];
  campuses: CampusOption[];
  requireCampus: boolean;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

export function PromoteForm({ profiles, campuses, requireCampus, action }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        router.push('/people');
        router.refresh();
      }
      return result;
    },
    null,
  );

  if (profiles.length === 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-foreground">
        No eligible profiles found. The person must already have signed up before they
        can be promoted.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="profile_id">Person</Label>
        <select
          id="profile_id"
          name="profile_id"
          required
          defaultValue=""
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="" disabled>— Select a person —</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
              {p.email ? ` · ${p.email}` : ''}
              {' · '}
              {p.role.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="campus_id">
          Campus {requireCampus ? <span className="text-danger">*</span> : '(optional)'}
        </Label>
        <select
          id="campus_id"
          name="campus_id"
          required={requireCampus}
          defaultValue=""
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">{requireCampus ? '— Select a campus —' : '— None —'}</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          Mobile number <span className="text-danger">*</span>
        </Label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          placeholder="(555) 555-5555"
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        />
        <p className="text-xs text-foreground-subtle">
          Required for admins so they can receive operational notifications.
        </p>
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Promote'}
      </Button>
    </form>
  );
}
