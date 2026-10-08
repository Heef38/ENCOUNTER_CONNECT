'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { logContact } from '@/lib/connect/touch-actions';

const KINDS = [
  ['call', 'Called'],
  ['text', 'Texted'],
  ['in_person', 'Talked in person'],
  ['email', 'Emailed'],
  ['note', 'Just a note'],
] as const;

export function LogContactButton({ participantId, name }: { participantId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('call');
  const [summary, setSummary] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
        Log a contact
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Log a contact" className="w-96">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-foreground">You reached out to {name}</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            Meetings booked through the app and messages it sends count on their own. Log the calls, texts and coffees it
            can&apos;t see. Only your church&apos;s connectors and admins read these notes.
          </p>
        </div>
        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          <fieldset className="space-y-1.5">
            {KINDS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input type="radio" name="kind" checked={kind === value} onChange={() => setKind(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div>
            <Label htmlFor="when">When (leave blank for today)</Label>
            <Input id="when" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="summary">Anything worth remembering? (optional)</Label>
            <textarea
              id="summary"
              rows={3}
              maxLength={2000}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="Left a voicemail. Coffee Thursday?"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await logContact(participantId, kind, summary, day || undefined);
                  if (r.success) {
                    setOpen(false);
                    setSummary('');
                    setDay('');
                    router.refresh();
                  } else setError(r.error);
                })
              }
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
