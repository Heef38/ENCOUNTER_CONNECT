'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { confirmMember, welcomeAsNew } from '@/lib/connect/member-actions';

/** Confirm a member, or welcome them as new. For the church's admins. */
export function MembershipControls({
  participantId,
  joinedAs,
  confirmed,
  compact = false,
}: {
  participantId: string;
  joinedAs: 'guest' | 'member';
  confirmed: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: (id: string) => Promise<{ success: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn(participantId);
      if (r.success) router.refresh();
      else setError(r.error ?? 'Something went wrong.');
    });

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(confirmMember)}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(welcomeAsNew)}>
          They&apos;re new
        </Button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-foreground-muted">
        {joinedAs === 'guest'
          ? 'Came in new. They are in the welcome pipeline.'
          : confirmed
            ? 'A confirmed member. Not counted as a newcomer.'
            : 'Joined saying they already belong here. Confirm them, or welcome them as new.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {(joinedAs === 'guest' || !confirmed) && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(confirmMember)}>
            {joinedAs === 'guest' ? 'They already belong here' : 'Confirm member'}
          </Button>
        )}
        {joinedAs === 'member' && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(welcomeAsNew)}>
            Welcome as new instead
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
