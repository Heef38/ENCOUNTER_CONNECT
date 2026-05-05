import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

interface Row {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  campus: { id: string; name: string } | null;
  leader: { id: string; first_name: string; last_name: string } | null;
}

export default async function ServeTeamsSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from('serve_teams')
    .select(
      `id, name, description, is_active,
       campus:campuses(id, name),
       leader:profiles!serve_teams_leader_profile_id_fkey(id, first_name, last_name)`,
    )
    .order('name');

  if (session.profile?.church_id) {
    q = q.eq('church_id', session.profile.church_id);
  }

  const { data, error } = await q;
  const teams = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/settings"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Settings
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Serve teams
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Teams participants can be connected to once they discover their gifts.
          </p>
        </div>
        <Link href="/settings/serve-teams/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New team
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No serve teams yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Create a serve team so the spiritual gifts assessment can route people to it.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Campus</TH>
                <TH>Leader</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {teams.map((t) => (
                <TR key={t.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link
                      href={`/settings/serve-teams/${t.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {t.name}
                    </Link>
                    {t.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-foreground-subtle">
                        {t.description}
                      </div>
                    )}
                  </TD>
                  <TD className="text-foreground-muted">
                    {t.campus?.name ?? 'All campuses'}
                  </TD>
                  <TD className="text-foreground-muted">
                    {t.leader
                      ? `${t.leader.first_name} ${t.leader.last_name}`
                      : '—'}
                  </TD>
                  <TD>
                    {t.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
