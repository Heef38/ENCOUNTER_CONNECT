'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cancelEvent, publishEvent, setEventPinned } from '@/lib/events/actions';

/**
 * Host and admin controls. Cancelling keeps the gathering visible to its
 * audience with a banner rather than deleting it, and tells everyone who
 * RSVP'd going or maybe.
 */
export function HostActions({
  eventId,
  status,
  canEdit,
  canPin,
  isPinned,
  futureInSeries,
}: {
  eventId: string;
  status: string;
  canEdit: boolean;
  canPin: boolean;
  isPinned: boolean;
  futureInSeries: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'one' | 'future'>('one');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const live = status === 'published' || status === 'draft';

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        after?.();
        router.refresh();
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    });
  }

  return (
    <>
      {canEdit && live && (
        <Link href={`/hub/e/${eventId}/edit`}>
          <Button variant="outline" size="sm">Edit</Button>
        </Link>
      )}
      {canEdit && status === 'draft' && (
        <Button size="sm" disabled={pending} onClick={() => run(() => publishEvent(eventId, futureInSeries > 1 ? 'future' : 'one'))}>
          Publish{futureInSeries > 1 ? ` all ${futureInSeries}` : ''}
        </Button>
      )}
      {canEdit && live && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Cancel gathering
        </Button>
      )}
      {canPin && status === 'published' && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setEventPinned(eventId, !isPinned))}>
          {isPinned ? <PinOff className="mr-1.5 h-3.5 w-3.5" /> : <Pin className="mr-1.5 h-3.5 w-3.5" />}
          {isPinned ? 'Unpin' : 'Pin to the top'}
        </Button>
      )}
      {error && !open && <p className="w-full text-xs text-danger">{error}</p>}
      {notice && <p className="w-full text-xs text-foreground-muted">{notice}</p>}

      <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Cancel this gathering" className="w-96">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-foreground">Cancel this gathering</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            It stays on the hub marked cancelled so nobody turns up, and everyone who said going or maybe gets an
            email (and a text, if they&apos;ve opted in).
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <Label htmlFor="cancel-reason">Why? (shown to everyone invited)</Label>
            <Input
              id="cancel-reason"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Weather, illness, rescheduling…"
              className="mt-1"
            />
          </div>

          {futureInSeries > 1 && (
            <fieldset className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="cancel-scope" checked={scope === 'one'} onChange={() => setScope('one')} />
                Just this one
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="cancel-scope" checked={scope === 'future'} onChange={() => setScope('future')} />
                This and the {futureInSeries - 1} after it
              </label>
            </fieldset>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const r = await cancelEvent(eventId, reason, scope);
                    if (r.success) setNotice(r.data.notified > 0 ? `Cancelled. ${r.data.notified} message${r.data.notified === 1 ? '' : 's'} on the way.` : 'Cancelled.');
                    return r;
                  },
                  () => setOpen(false),
                )
              }
            >
              {pending ? 'Cancelling…' : 'Cancel gathering'}
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
