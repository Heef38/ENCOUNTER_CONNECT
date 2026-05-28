'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { saveMeetingNotes, completeMeeting } from '@/lib/connectors/meeting-actions';

interface Props {
  progressId: string;
  participantId: string;
  initialNotes: string;
  completed: boolean;
}

export function MeetingNotesEditor({ progressId, participantId, initialNotes, completed }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-success/40 bg-success-bg/50 px-3 py-2 text-sm text-foreground">
          <span className="font-medium text-foreground">Meeting completed.</span> These
          notes have been shared with the participant.
        </div>
        <div className="whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-sm text-foreground">
          {notes || 'No notes were recorded.'}
        </div>
      </div>
    );
  }

  function save() {
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await saveMeetingNotes(progressId, notes);
      if (!res.ok) return setError(res.error ?? 'Could not save.');
      setMsg('Saved.');
    });
  }

  function complete() {
    if (!confirm('Complete this meeting? Your notes will be shared with the participant and the meeting marked done.')) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await completeMeeting(progressId, notes);
      if (!res.ok) return setError(res.error ?? 'Could not complete.');
      router.push(`/connector/participants/${participantId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setMsg(null); }}
        rows={10}
        placeholder="Notes from your conversation… these are shared with the participant when you complete the meeting."
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {msg && <p className="text-sm text-success">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={save} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? 'Saving…' : 'Save notes'}
        </Button>
        <Button onClick={complete} disabled={pending}>
          <Check className="h-4 w-4" />
          Complete meeting
        </Button>
      </div>
    </div>
  );
}
