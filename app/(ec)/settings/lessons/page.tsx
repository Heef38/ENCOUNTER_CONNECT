import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { Lesson } from '@/lib/lessons/types';

export default async function LessonsSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('lessons')
    .select('id, church_id, title, slug, body, order_index, is_published, created_at, updated_at')
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: false });

  if (session.profile?.church_id) {
    query = query.eq('church_id', session.profile.church_id);
  }

  const { data, error } = await query;
  const lessons = (data ?? []) as Lesson[];

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
            Lessons
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Markdown lessons referenced by your flows. Reorder by editing each lesson&apos;s order index.
          </p>
        </div>
        <Link href="/settings/lessons/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New lesson
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error.message}
        </div>
      )}

      {lessons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No lessons yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Create your first lesson to wire it into a flow step.
          </p>
          <Link href="/settings/lessons/new" className="mt-4 inline-block">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New lesson
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-sm">
          <Table>
            <THead>
              <TR>
                <TH>Order</TH>
                <TH>Title</TH>
                <TH>Slug</TH>
                <TH>Status</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {lessons.map((l) => (
                <TR key={l.id} className="hover:bg-surface-muted/60">
                  <TD className="text-foreground-muted">{l.order_index}</TD>
                  <TD>
                    <Link
                      href={`/settings/lessons/${l.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {l.title}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs text-foreground-muted">
                    {l.slug ?? '—'}
                  </TD>
                  <TD>
                    {l.is_published ? (
                      <Badge tone="success">Published</Badge>
                    ) : (
                      <Badge tone="neutral">Draft</Badge>
                    )}
                  </TD>
                  <TD className="text-foreground-muted">
                    {new Date(l.updated_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
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
