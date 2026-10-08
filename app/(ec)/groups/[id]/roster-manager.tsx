'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addGroupMember,
  addGroupMemberByEmail,
  archiveGroup,
  removeGroupMember,
  setGroupMemberRole,
} from '@/lib/groups/actions';
import type { GroupMemberView } from '@/lib/groups/queries';

/**
 * Roster controls. Admins pick from the church; leaders add by exact email
 * (there is no member directory to browse). The database checks both.
 */
export function RosterManager({
  groupId,
  members,
  canAdmin,
  people,
}: {
  groupId: string;
  members: GroupMemberView[];
  canAdmin: boolean;
  people: Array<{ id: string; name: string; email: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pick, setPick] = useState('');
  const memberIds = new Set(members.map((m) => m.profile_id));

  function run(fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>, ok?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const r = await fn();
      if (r.success) {
        if (ok) setNotice(ok);
        router.refresh();
      } else setError(r.error ?? 'Something went wrong.');
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold text-foreground">Manage the roster</h2>

      {canAdmin ? (
        <div className="flex flex-wrap gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-64 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm">
            <option value="">Add someone from your church…</option>
            {people
              .filter((p) => !memberIds.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.email ? ` (${p.email})` : ''}
                </option>
              ))}
          </select>
          <Button disabled={!pick || pending} onClick={() => run(() => addGroupMember(groupId, pick), 'Added.')}>
            Add
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email address" type="email" className="min-w-64 flex-1" />
          <Button
            disabled={!email.trim() || pending}
            onClick={() =>
              run(async () => {
                const r = await addGroupMemberByEmail(groupId, email);
                if (r.success) setEmail('');
                return r;
              }, 'Added.')
            }
          >
            Add by email
          </Button>
        </div>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {members.map((m) => (
          <li key={m.profile_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              {m.first_name} {m.last_name}
              {m.role === 'leader' && <span className="ml-2 text-xs text-foreground-subtle">Leader</span>}
            </span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => setGroupMemberRole(groupId, m.profile_id, m.role === 'leader' ? 'member' : 'leader'))}
              >
                {m.role === 'leader' ? 'Make member' : 'Make leader'}
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeGroupMember(groupId, m.profile_id), 'Removed.')}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {canAdmin && (
        <div className="border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await archiveGroup(groupId);
                if (r.success) router.push('/groups');
                return r;
              })
            }
          >
            Archive this group
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {notice && <p className="text-xs text-foreground-muted">{notice}</p>}
    </section>
  );
}
