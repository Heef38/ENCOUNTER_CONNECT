import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { getGroupDetail, listChurchPeopleForPicker } from '@/lib/groups/queries';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RosterManager } from './roster-manager';

/**
 * A group's page. Members see who's in it (first name + last initial), the
 * leader, and what's coming up; leaders and admins also keep the roster.
 * Someone outside a private or youth group gets a 404 (RLS).
 */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth();
  const detail = await getGroupDetail(id);
  if (!detail) notFound();
  const { group } = detail;
  const people = detail.canAdmin ? await listChurchPeopleForPicker(group.church_id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/groups" className="text-sm text-foreground-muted hover:text-primary">
        ← All groups
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {group.is_private && (
              <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                <Lock className="h-3 w-3" />
                Private group
              </span>
            )}
            {group.is_youth && <Badge tone="info">Youth</Badge>}
            {!group.is_active && <Badge tone="neutral">Archived</Badge>}
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">{group.name}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {detail.leaderName ? `Led by ${detail.leaderName}` : 'No leader yet'}
            {detail.parentName ? ` · part of ${detail.parentName}` : ''}
          </p>
        </div>
        {detail.canAdmin && (
          <Link href={`/groups/${group.id}/edit`}>
            <Button variant="outline" size="sm">Edit group</Button>
          </Link>
        )}
      </header>

      {group.description && <p className="whitespace-pre-wrap text-sm text-foreground">{group.description}</p>}

      <section>
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">Coming up</h2>
        {detail.upcoming.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nothing on the calendar for this group yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {detail.upcoming.map((e) => (
              <li key={e.id} className="px-4 py-2 text-sm">
                <Link href={`/hub/e/${e.id}`} className="font-medium text-foreground hover:text-primary">
                  {e.status === 'cancelled' ? <s>{e.title}</s> : e.title}
                </Link>
                <span className="text-foreground-subtle">
                  {' '}
                  · {formatDateInZone(e.starts_at, e.timezone, { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                  {formatTimeInZone(e.starts_at, e.timezone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.canManageRoster ? (
        <RosterManager groupId={group.id} members={detail.members} canAdmin={detail.canAdmin} people={people} />
      ) : (
        <section>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            {detail.isMember ? `Who's in it (${detail.members.length})` : 'Members'}
          </h2>
          {detail.isMember ? (
            <ul className="flex flex-wrap gap-2">
              {detail.members.map((m) => (
                <li key={m.profile_id} className="rounded-full border border-border px-3 py-1 text-sm text-foreground">
                  {m.first_name} {m.last_name ? `${m.last_name}${m.last_name.length === 1 ? '.' : ''}` : ''}
                  {m.role === 'leader' ? ' · leader' : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">
              Want to join? Ask {detail.leaderName ?? 'the leader'} or your church to add you.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
