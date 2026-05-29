import Link from 'next/link';
import { ChevronLeft, Plus, ExternalLink } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { DocVisibility } from '@/lib/connect-docs/types';

const VISIBILITY_TONES: Record<
  DocVisibility,
  'neutral' | 'info' | 'success'
> = {
  staff:        'neutral',
  participants: 'info',
  public:       'success',
};

interface Row {
  id: string;
  title: string;
  description: string | null;
  visibility: DocVisibility;
  is_active: boolean;
  file_url: string | null;
  campus: { id: string; name: string } | null;
}

export default async function ConnectDocsSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from('connect_docs')
    .select(
      `id, title, description, visibility, is_active, file_url,
       campus:campuses(id, name)`,
    )
    .order('title');

  if (session.profile?.church_id) {
    q = q.eq('church_id', session.profile.church_id);
  }

  const { data, error } = await q;
  const docs = (data ?? []) as unknown as Row[];

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
            Connect docs
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Documents and resources you can share with staff or participants.
          </p>
        </div>
        <Link href="/settings/connect-docs/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New doc
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No connect docs yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Add your first resource — onboarding guides, ministry FAQs, anything.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Title</TH>
                <TH>Campus</TH>
                <TH>Visibility</TH>
                <TH>Status</TH>
                <TH>File</TH>
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => (
                <TR key={d.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link
                      href={`/settings/connect-docs/${d.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {d.title}
                    </Link>
                    {d.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-foreground-subtle">
                        {d.description}
                      </div>
                    )}
                  </TD>
                  <TD className="text-foreground-muted">
                    {d.campus?.name ?? 'All campuses'}
                  </TD>
                  <TD>
                    <Badge tone={VISIBILITY_TONES[d.visibility]}>{d.visibility}</Badge>
                  </TD>
                  <TD>
                    {d.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </TD>
                  <TD>
                    {d.file_url ? (
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-foreground-subtle">—</span>
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
