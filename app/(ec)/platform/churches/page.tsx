import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Church } from '@/lib/church/types';

interface Row extends Church {
  campus_count: { count: number }[] | null;
  participant_count: { count: number }[] | null;
}

export default async function PlatformChurchesPage() {
  await requirePlatformAdmin();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('churches')
    .select(
      `id, name, slug, timezone, is_active, logo_url, brand_color, description, created_at, updated_at,
       campus_count:campuses(count),
       participant_count:participants(count)`,
    )
    .order('name');

  const churches = (data ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Churches
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Every tenant on the platform.
          </p>
        </div>
        <Link href="/platform/churches/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New church
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {churches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No churches yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Slug</TH>
                <TH>Timezone</TH>
                <TH>Campuses</TH>
                <TH>Participants</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {churches.map((c) => (
                <TR key={c.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link
                      href={`/platform/churches/${c.id}`}
                      className="flex items-center gap-2 font-medium text-foreground hover:text-primary"
                    >
                      {c.brand_color && (
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ background: c.brand_color }}
                        />
                      )}
                      {c.name}
                    </Link>
                    {c.description && (
                      <div className="mt-0.5 line-clamp-1 text-xs text-foreground-subtle">
                        {c.description}
                      </div>
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-foreground-muted">
                    {c.slug ?? '—'}
                  </TD>
                  <TD className="text-foreground-muted">{c.timezone}</TD>
                  <TD className="text-foreground-muted">
                    {c.campus_count?.[0]?.count ?? 0}
                  </TD>
                  <TD className="text-foreground-muted">
                    {c.participant_count?.[0]?.count ?? 0}
                  </TD>
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
