'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  bookingId: string;
  startsAt: string;
  confirmAction: (id: string) => Promise<{ ok: boolean; error?: string }>;
  declineAction: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function BookingDecision({
  bookingId,
  startsAt,
  confirmAction,
  declineAction,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: 'confirm' | 'decline') {
    if (action === 'decline') {
      const ok = window.confirm(
        'Decline this meeting? The participant will be asked to pick a different time.',
      );
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      const result =
        action === 'confirm'
          ? await confirmAction(bookingId)
          : await declineAction(bookingId);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
        return;
      }
      router.refresh();
    });
  }

  const start = new Date(startsAt);

  return (
    <div className="rounded-lg border-2 border-warning/40 bg-warning-bg/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-warning">
        Pending your confirmation
      </p>
      <p className="mt-1 text-sm text-foreground">
        {start.toLocaleString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => act('confirm')}>
          <Check className="h-4 w-4" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => act('decline')}
        >
          <X className="h-4 w-4" />
          Decline
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
