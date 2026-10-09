'use client';

import { useState, useTransition } from 'react';
import { MailCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resendInvite, revokeInvite } from '@/lib/invites/actions';
import { roleLabel } from '@/lib/invites/types';
import type { InviteListItem } from '@/lib/invites/queries';

export function PendingInvites({ invites, canManageStaff }: { invites: InviteListItem[]; canManageStaff: boolean }) {
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  if (invites.length === 0) return null;

  const run = (id: string, fn: (id: string) => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn(id);
      setNotice({ id, ok: r.ok, text: r.ok ? (r.message ?? 'Done.') : (r.error ?? 'Something went wrong.') });
    });

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-surface-muted text-foreground-muted">
          <MailCheck className="h-4 w-4" />
        </span>
        Invited, not joined yet
        <span className="text-foreground-subtle">({invites.length})</span>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        {invites.map((i) => {
          const staff = i.role !== 'participant';
          const manageable = !staff || canManageStaff;
          return (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{i.name ?? i.email}</p>
                <p className="truncate text-xs text-foreground-subtle">
                  {i.email}
                  {i.send_count > 0 ? ` · sent ${i.send_count} ${i.send_count === 1 ? 'time' : 'times'}` : ''}
                </p>
                {notice?.id === i.id && (
                  <p className={notice.ok ? 'text-xs text-success' : 'text-xs text-danger'}>{notice.text}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={staff ? 'info' : 'neutral'}>{roleLabel(i.role)}</Badge>
                {i.send_count === 0 ? (
                  <Badge tone="neutral">Not sent yet</Badge>
                ) : (
                  i.state === 'expired' && <Badge tone="warning">Expired</Badge>
                )}
                {manageable && (
                  <>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(i.id, resendInvite)}>
                      {i.send_count === 0 ? 'Send' : 'Send again'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(i.id, revokeInvite)}>
                      Withdraw
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
