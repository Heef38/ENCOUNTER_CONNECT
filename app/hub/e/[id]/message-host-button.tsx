'use client';

import { useState, useTransition } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { messageHost } from '@/lib/events/actions';

/** In-app relay: the host gets your message and your email, never the reverse. */
export function MessageHostButton({ eventId, hostName }: { eventId: string; hostName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const r = await messageHost(eventId, text);
      if (r.success) {
        setSent(true);
        setText('');
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
        Message {hostName.split(' ')[0]}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} side="right" label="Message the host" className="w-96">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-display text-lg font-medium text-foreground">Message {hostName}</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            We send it by email with your name and email so they can write back. Your number and theirs stay private.
          </p>
        </div>
        <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
          {sent ? (
            <p className="text-sm text-foreground">Sent. They&apos;ll reply to your email.</p>
          ) : (
            <>
              <div>
                <Label htmlFor="msg">Your message</Label>
                <textarea
                  id="msg"
                  value={text}
                  maxLength={1500}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  placeholder="Can I bring my kids? What should I bring?"
                />
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={send} disabled={pending || !text.trim()}>
                  {pending ? 'Sending…' : 'Send'}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
