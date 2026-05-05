'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ECUserRole } from '@/lib/church/types';
import type { ActionResult } from '@/lib/people/actions';

const ROLES: { value: ECUserRole; label: string }[] = [
  { value: 'church_admin', label: 'Church admin' },
  { value: 'campus_admin', label: 'Campus admin' },
  { value: 'connector',    label: 'Connector' },
  { value: 'participant',  label: 'Participant' },
];

interface Props {
  profile: { role: ECUserRole; campus_id: string | null };
  campuses: { id: string; name: string }[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

export function ProfileEditForm({ profile, campuses, action }: Props) {
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

  return (
    <form action={formAction} className="space-y-5 rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            name="role"
            defaultValue={profile.role}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="campus_id">Campus</Label>
          <select
            id="campus_id"
            name="campus_id"
            defaultValue={profile.campus_id ?? ''}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— None —</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
