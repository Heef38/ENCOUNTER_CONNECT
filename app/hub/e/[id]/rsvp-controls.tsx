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
  currentGuests,
  isPrivateHome,
}: {
  eventId: string;
  current: RsvpStatus | null;
  currentGuests: number;
  isPrivateHome: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<RsvpStatus | null>(current);
  const [guests, setGuests] = useState(currentGuests);
  const [error, setError] = useState<string | null>(null);

  function respond(next: RsvpStatus, nextGuests = guests) {
    setError(null);
    startTransition(async () => {
      const result = await rsvpToEvent(eventId, next, next === 'going' ? nextGuests : 0);
      if (result.success) {
        setStatus(next);
        setGuests(next === 'going' ? nextGuests : 0);
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
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
          <label htmlFor="guests">Bringing anyone?</label>
          <select
            id="guests"
            value={guests}
            disabled={pending}
            onChange={(e) => respond('going', Number(e.target.value))}
            className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs"
          >
            {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'Just me' : `+${n} friend${n === 1 ? '' : 's'}`}
              </option>
            ))}
          </select>
          <span>The host can see your name.</span>
        </div>
      )}
      {status === 'maybe' && isPrivateHome && (
        <p className="mt-2 text-xs text-foreground-muted">The host shares a home&apos;s address with people who are going.</p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
