'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setHostBlocked, setTrustedHost } from '@/lib/connect/touch-actions';

/** Admin controls for whether someone can host gatherings. */
export function HostStanding({
  profileId,
  trusted,
  blocked,
}: {
  profileId: string;
  trusted: boolean;
  blocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.success) router.refresh();
      else setError(r.error ?? 'Something went wrong.');
    });

  return (
    <div className="space-y-2 text-sm">
      <p className="text-foreground-muted">
        {blocked
          ? 'Blocked from hosting.'
          : trusted
            ? 'Trusted host: can host without the journey.'
            : 'Hosts once their first meeting is done and they finish the host orientation.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!blocked && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setTrustedHost(profileId, !trusted))}>
            {trusted ? 'Remove trusted host' : 'Mark trusted host'}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setHostBlocked(profileId, !blocked))}>
          {blocked ? 'Unblock hosting' : 'Block hosting'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
