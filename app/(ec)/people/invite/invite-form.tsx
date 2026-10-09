'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ECUserRole } from '@/lib/church/types';
import { inviteToChurch, type InviteActionResult } from '@/lib/invites/actions';

interface Props {
  campuses: Array<{ id: string; name: string }>;
  canInviteStaff: boolean;
  connectName: string;
}

const ROLE_OPTIONS: Array<{ value: ECUserRole; label: string; hint: string; staff: boolean }> = [
  { value: 'participant', label: 'Member', hint: 'Someone who already belongs here. They will not show up as a newcomer.', staff: false },
  { value: 'connector', label: 'Connector', hint: 'Welcomes new people and walks with them.', staff: true },
  { value: 'campus_admin', label: 'Campus admin', hint: 'Looks after one campus.', staff: true },
  { value: 'church_admin', label: 'Church admin', hint: 'Full access across the church.', staff: true },
];

export function InviteForm({ campuses, canInviteStaff, connectName }: Props) {
  const [role, setRole] = useState<ECUserRole>('participant');
  const [round, setRound] = useState(0);
  const [state, formAction, pending] = useActionState<InviteActionResult | null, FormData>(async (prev, formData) => {
    const result = await inviteToChurch(prev, formData);
    if (result.ok) setRound((r) => r + 1);
    return result;
  }, null);
  const options = ROLE_OPTIONS.filter((o) => canInviteStaff || !o.staff);
  const select = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

  return (
    <form key={round} action={formAction} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">They are joining as</legend>
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm text-foreground">
            <input type="radio" name="role" value={o.value} checked={role === o.value} onChange={() => setRole(o.value)} className="mt-0.5" />
            <span>
              {o.label}
              <span className="block text-xs text-foreground-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" name="first_name" autoComplete="off" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" autoComplete="off" className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="off" className="mt-1" />
      </div>
      {campuses.length > 0 && (
        <div>
          <Label htmlFor="campus_id">Campus{role === 'campus_admin' ? '' : ' (optional)'}</Label>
          <select id="campus_id" name="campus_id" required={role === 'campus_admin'} defaultValue={campuses.length === 1 ? campuses[0].id : ''} className={select}>
            <option value="">No campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-xs text-foreground-subtle">
        They get an email from {connectName} with a link to set their own password. The link works for 14 days, and
        sending it again replaces the old one.
      </p>

      {state && !state.ok && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">{state.message}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  );
}
