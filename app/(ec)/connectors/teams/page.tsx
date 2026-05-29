import Link from 'next/link';
import { ChevronLeft, Plus, Users } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listTeams } from '@/lib/connector-teams/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function ConnectorTeamsPage() {
  const session = await requireStaff();
  const churchId = session.profile?.church_id;
  const role = session.profile?.role;
  const canManage =
    (session.profile?.is_platform_admin ?? false) ||
    role === 'church_admin' ||
    role === 'campus_admin';

  const supabase = await createServerSupabaseClient();
  const teams = churchId ? await listTeams(supabase, churchId) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/connectors"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Connectors
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Connector teams
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Pairs of connectors who share one schedule and meet together. Both
            members get every notification.
          </p>
        </div>
        {canManage && (
          <Link href="/connectors/teams/new">
            <Button size="md">
              <Plus className="h-4 w-4" />
              New team
            </Button>
          </Link>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <Users className="mx-auto h-6 w-6 text-foreground-subtle" />
          <p className="mt-2 text-sm text-foreground-subtle">No teams yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/connectors/teams/${t.id}`}
              className="group rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium text-foreground group-hover:text-primary">
                  {t.name}
                </p>
                <Badge tone={t.is_active ? 'success' : 'neutral'}>
                  {t.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {t.campus && (
                <p className="mt-0.5 text-xs text-foreground-subtle">{t.campus.name}</p>
              )}
              <div className="mt-4 border-t border-border pt-3 text-sm text-foreground-muted">
                {t.members.length === 0
                  ? '—'
                  : t.members
                      .map((m) => `${m.first_name} ${m.last_name}`.trim())
                      .join(' & ')}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
