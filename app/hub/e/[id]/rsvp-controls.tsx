'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { rsvpToEvent } from '@/lib/events/actions';
import type { RsvpStatus } from '@/lib/events/types';

const OPTIONS: Array<{ value: RsvpStatus; label: string }> = [
  { value: 'going', label: "I'm going" },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not_going', label: "Can't make it" },
];

export function RsvpControls({
  eventId,
  current,
}: {
  eventId: string;
  current: RsvpStatus | null;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<RsvpStatus | null>(current);
  const [error, setError] = useState<string | null>(null);

  function respond(next: RsvpStatus) {
    setError(null);
    startTransition(async () => {
      const result = await rsvpToEvent(eventId, next);
      if (result.success) {
        setStatus(next);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            variant={status === o.value ? 'primary' : 'outline'}
            size="sm"
            disabled={pending}
            onClick={() => respond(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {status === 'going' && (
        <p className="mt-2 text-xs text-foreground-muted">
          You&apos;re on the list. The host can see your name.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
