'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createGroupFromServeTeam } from '@/lib/groups/actions';

/** Serve teams that aren't groups yet, one click each. */
export function ServeTeamImport({ teams }: { teams: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Serve teams that aren&apos;t groups yet</h2>
      <p className="mt-1 text-xs text-foreground-muted">Make one a group so its people can be invited, gathered, and shown on its page.</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {teams.map((t) => (
          <li key={t.id}>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await createGroupFromServeTeam(t.id);
                  if (r.success) router.push(`/groups/${r.data.id}`);
                  else setError(r.error);
                })
              }
            >
              {t.name}
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
