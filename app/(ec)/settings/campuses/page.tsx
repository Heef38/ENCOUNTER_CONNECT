import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Campus } from '@/lib/church/types';

export default async function CampusesSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  let q = supabase.from('campuses').select('*').order('name');
  if (session.profile?.church_id) {
    q = q.eq('church_id', session.profile.church_id);
  }
  const { data, error } = await q;
  const campuses = (data ?? []) as Campus[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Dashboard
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Campuses
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Each physical or virtual location your church operates from.
          </p>
        </div>
        <Link href="/settings/campuses/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New campus
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {campuses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No campuses yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Add your first campus to organize people and serve teams.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Location</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {campuses.map((c) => (
                <TR key={c.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link
                      href={`/settings/campuses/${c.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-foreground-muted">{c.location ?? '—'}</TD>
                  <TD>
                    {c.is_active ? (
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
