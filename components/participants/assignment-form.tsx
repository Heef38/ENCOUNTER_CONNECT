'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { reassignParticipant } from '@/lib/participants/actions';

interface Campus {
  id: string;
  name: string;
}
interface Church {
  id: string;
  name: string;
}

interface Props {
  participantId: string;
  churchId: string;
  campusId: string | null;
  /** Active campuses in the participant's current church. */
  campuses: Campus[];
  /** Platform admins only: all churches + campuses keyed by church. */
  churches?: Church[] | null;
  campusesByChurch?: Record<string, Campus[]> | null;
}

const selectClass =
  'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none';

export function ParticipantAssignmentForm({
  participantId,
  churchId,
  campusId,
  campuses,
  churches,
  campusesByChurch,
}: Props) {
  const router = useRouter();
  const isPlatform = Boolean(churches && campusesByChurch);
  const [church, setChurch] = useState(churchId);
  const [campus, setCampus] = useState(campusId ?? '');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const campusOptions = useMemo(
    () => (isPlatform ? campusesByChurch?.[church] ?? [] : campuses),
    [isPlatform, campusesByChurch, church, campuses],
  );

  const dirty = church !== churchId || campus !== (campusId ?? '');

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await reassignParticipant(
        participantId,
        isPlatform ? church : null,
        campus || null,
      );
      if (!res.ok) {
        setError(res.error ?? 'Failed to save.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 text-sm">
      {isPlatform && churches && (
        <div className="space-y-1">
          <label className="text-xs text-foreground-muted">Church</label>
          <select
            className={selectClass}
            value={church}
            onChange={(e) => {
              setChurch(e.target.value);
              setCampus(''); // campus belongs to a church; reset on change
              setSaved(false);
            }}
          >
            {churches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-foreground-muted">Campus</label>
        <select
          className={selectClass}
          value={campus}
          onChange={(e) => { setCampus(e.target.value); setSaved(false); }}
        >
          <option value="">— Unassigned —</option>
          {campusOptions.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {saved && !dirty && <p className="text-xs text-success">Saved.</p>}

      <Button size="sm" onClick={save} disabled={pending || !dirty}>
        {pending ? 'Saving…' : 'Save assignment'}
      </Button>
    </div>
  );
}
