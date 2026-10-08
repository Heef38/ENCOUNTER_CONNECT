'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { resolveEventReport } from '@/lib/events/actions';
import type { ReportResolution } from '@/lib/events/types';

export function ReviewActions({ eventId, hidden }: { eventId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolve(resolution: ReportResolution) {
    setError(null);
    startTransition(async () => {
      const r = await resolveEventReport(eventId, resolution);
      if (r.success) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => resolve(hidden ? 'restored' : 'no_action')}>
        {hidden ? 'Put it back up' : 'Looks fine'}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve('cancelled')}>
        Cancel the gathering
      </Button>
      {confirmBlock ? (
        <>
          <Button size="sm" variant="danger" disabled={pending} onClick={() => resolve('host_blocked')}>
            Cancel it and stop this host
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmBlock(false)}>
            Never mind
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmBlock(true)}>
          Block the host…
        </Button>
      )}
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
