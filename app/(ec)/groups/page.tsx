import Link from 'next/link';
import { Lock, Users } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { listGroups } from '@/lib/groups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ServeTeamImport } from './serve-team-import';

const KIND_LABEL: Record<string, string> = {
  home_group: 'Home group',
  ministry: 'Ministry',
  serve: 'Serve team',
  interest: 'Interest',
  age_stage: 'Age / stage',
  roster: 'Roster',
  custom: 'Group',
};

/**
 * Groups. Staff see every group in the church and curate rosters; members
 * see the directory of open groups plus their own (RLS, migration 026).
 */
export default async function GroupsPage() {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">You are not attached to a church.</p>;

  const isAdmin =
    Boolean(session.profile?.is_platform_admin) ||
    session.profile?.role === 'church_admin' ||
    session.profile?.role === 'campus_admin';

  const groups = await listGroups(churchId);
  const mine = groups.filter((g) => g.is_member);
  const others = groups.filter((g) => !g.is_member);

  let unlinkedTeams: Array<{ id: string; name: string }> = [];
  if (isAdmin) {
    const supabase = await createServerSupabaseClient();
    const { data: teams } = await supabase.from('serve_teams').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name');
    const linked = new Set(groups.map((g) => g.serve_team_id).filter(Boolean));
    unlinkedTeams = ((teams ?? []) as Array<{ id: string; name: string }>).filter((t) => !linked.has(t.id));
  }

  const card = (g: (typeof groups)[number]) => (
    <li key={g.id}>
      <Link href={`/groups/${g.id}`}>
        <Card className="h-full transition-colors hover:border-border-strong">
          <CardContent className="space-y-1.5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground-subtle">{KIND_LABEL[g.kind] ?? 'Group'}</span>
              {g.is_private && (
                <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
                  <Lock className="h-3 w-3" />
                  Private
                </span>
              )}
              {g.is_youth && <Badge tone="info">Youth</Badge>}
            </div>
            <div className="font-medium text-foreground">{g.name}</div>
            <div className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <Users className="h-3.5 w-3.5" />
              {g.member_count} member{g.member_count === 1 ? '' : 's'}
              {g.parent_name ? ` · part of ${g.parent_name}` : ''}
            </div>
          </CardContent>
        </Card>
      </Link>
    </li>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Groups</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Who can see a private gathering is decided by its groups, so keeping these right keeps home addresses with the people they belong to.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Link href="/groups/start-home-group">
              <Button variant="outline">Start a home group</Button>
            </Link>
            <Link href="/groups/new">
              <Button>New group</Button>
            </Link>
          </div>
        )}
      </header>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">Your groups</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
          {isAdmin ? 'Every group' : 'Groups you can ask to join'}
        </h2>
        {others.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-foreground-muted">
            {isAdmin ? 'No groups yet. Start a home group or create one.' : 'No open groups listed yet.'}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map(card)}</ul>
        )}
      </section>

      {isAdmin && unlinkedTeams.length > 0 && <ServeTeamImport teams={unlinkedTeams} />}
    </div>
  );
}
