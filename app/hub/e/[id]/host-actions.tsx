'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cancelEvent } from '@/lib/events/actions';

/**
 * Host/admin controls. Cancelling keeps the event visible to its audience with
 * a banner rather than deleting it — nobody should show up to a home group that
 * quietly vanished.
 */
export function HostActions({
  eventId,
  cancelled,
}: {
  eventId: string;
  cancelled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (cancelled) return null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelEvent(eventId, reason);
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel event
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        label="Cancel this event"
        className="w-96"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-foreground">
            Cancel this event
          </h2>
          <p className="mt-1 text-xs text-foreground-muted">
            It stays on the hub marked cancelled so nobody turns up, and anyone
            who RSVP&apos;d will be told.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <Label htmlFor="cancel-reason">Why? (shown to everyone invited)</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Weather, illness, rescheduling…"
              className="mt-1"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button variant="danger" onClick={submit} disabled={pending}>
              {pending ? 'Cancelling…' : 'Cancel event'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
