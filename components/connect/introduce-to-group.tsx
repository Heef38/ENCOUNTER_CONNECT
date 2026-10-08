'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { introduceToGroup } from '@/lib/connect/touch-actions';

/** One tap from the console: put someone at a table. */
export function IntroduceToGroup({ participantId, groups }: { participantId: string; groups: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <select
        aria-label="Introduce to a group"
        disabled={pending}
        defaultValue=""
        onChange={(e) => {
          const gid = e.target.value;
          if (!gid) return;
          startTransition(async () => {
            const r = await introduceToGroup(participantId, gid);
            if (r.success) router.refresh();
            else setError(r.error);
          });
        }}
        className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground"
      >
        <option value="">Introduce to a group…</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {error && <span className="text-danger">{error}</span>}
    </>
  );
}
