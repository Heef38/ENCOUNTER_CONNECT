'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteFirstAdmin, type InviteActionResult } from '@/lib/invites/actions';

export function FirstAdminInvite({ churchId, connectName }: { churchId: string; connectName: string }) {
  const [state, action, pending] = useActionState<InviteActionResult | null, FormData>(
    inviteFirstAdmin.bind(null, churchId),
    null,
  );
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Invite a church admin</p>
        <p className="text-xs text-foreground-muted">
          The email comes from {connectName}, with a link to set their own password.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="fa_first">First name</Label>
          <Input id="fa_first" name="first_name" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="fa_last">Last name</Label>
          <Input id="fa_last" name="last_name" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="fa_email">Email</Label>
          <Input id="fa_email" name="email" type="email" required className="mt-1" />
        </div>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-success">{state.message}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  );
}
