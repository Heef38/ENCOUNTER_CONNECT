import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listConnectorsWithStats } from '@/lib/connectors/services';
import { requireStaff } from '@/lib/auth/dal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function ConnectorsPage() {
  const session = await requireStaff();
  const supabase = await createServerSupabaseClient();
  const result = await listConnectorsWithStats(supabase);
  const connectors = result.success ? result.data : [];

  // Which connectors are on a team (for the badge).
  const { data: memberRows } = await supabase
    .from('connector_team_members')
    .select('connector_id, team:connector_teams!inner(name)');
  const teamByConnector = new Map<string, string>();
  for (const r of (memberRows ?? []) as unknown as Array<{
    connector_id: string;
    team: { name: string } | null;
  }>) {
    if (r.team) teamByConnector.set(r.connector_id, r.team.name);
  }

  const role = session.profile?.role;
  const canManage =
    (session.profile?.is_platform_admin ?? false) ||
    role === 'church_admin' ||
    role === 'campus_admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Connectors
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            People guiding participants through the connection journey
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/connectors/teams">
            <Button variant="outline" size="md">
              <Users className="h-4 w-4" />
              Teams
            </Button>
          </Link>
          {canManage && (
            <Link href="/connectors/new">
              <Button size="md">
                <Plus className="h-4 w-4" />
                New connector
              </Button>
            </Link>
          )}
        </div>
      </div>

      {connectors.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-sm text-foreground-subtle">No connectors yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => (
            <Link
              key={c.id}
              href={`/connectors/${c.id}`}
              className="group rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground group-hover:text-primary">
                    {c.profile.first_name} {c.profile.last_name}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground-muted">{c.profile.email ?? '—'}</p>
                  {c.campus && (
                    <p className="mt-1 text-xs text-foreground-subtle">{c.campus.name}</p>
                  )}
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <Badge tone={c.is_active ? 'success' : 'neutral'}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  {teamByConnector.has(c.id) && (
                    <Badge tone="info">Team: {teamByConnector.get(c.id)}</Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-sm text-foreground-muted">
                  <span className="font-medium text-foreground">{c.participant_count}</span>{' '}
                  {c.participant_count === 1 ? 'participant' : 'participants'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!result.success && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">{result.error}</p>
      )}
    </div>
  );
}
