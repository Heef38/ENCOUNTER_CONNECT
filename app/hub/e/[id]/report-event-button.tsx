'use client';

import { useState, useTransition } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { reportEvent } from '@/lib/events/actions';
import type { ReportReason } from '@/lib/events/types';

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'not_legitimate', label: "This doesn't look like a real event" },
  { value: 'wrong_details', label: 'The details are wrong or out of date' },
  { value: 'inappropriate', label: "It isn't appropriate for our church" },
  { value: 'safety_concern', label: 'I have a safety concern' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

/**
 * Reporting alerts the church's admins. A report from someone connected at
 * the church takes the gathering off the hub until an admin looks; anyone
 * else's report is recorded and sent without pulling it. Only people who can
 * see a gathering can report it (the RLS INSERT policy is ec_can_see_event).
 */
export function ReportEventButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('not_legitimate');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { hidden: boolean }>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await reportEvent(eventId, reason, note);
      if (result.success) {
        setDone(result.data);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Flag className="mr-1.5 h-3.5 w-3.5" />
        Report
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        label="Report this event"
        className="w-96"
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-foreground">
            Report this event
          </h2>
          <p className="mt-1 text-xs text-foreground-muted">
            A church admin takes a look. Reports from people connected at this church take it off the hub until then.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {done ? (
            <p className="text-sm text-foreground">
              {done.hidden
                ? "Thanks. It's off the hub and the church's admins have been told."
                : "Thanks. The church's admins have been told and will take a look."}
            </p>
          ) : (
            <>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
                  What&apos;s wrong?
                </legend>
                {REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex cursor-pointer items-start gap-2 text-sm text-foreground"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="mt-0.5"
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>

              <div>
                <Label htmlFor="report-note">Anything else? (optional)</Label>
                <textarea
                  id="report-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <div className="flex gap-2">
                <Button onClick={submit} disabled={pending}>
                  {pending ? 'Sending…' : 'Report event'}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
