import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import type { AuditEntry } from '@/lib/audit/types';

const PAGE_SIZE = 50;

interface SearchParams {
  action?: string;
  entity_type?: string;
  actor_id?: string;
  page?: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}

function metadataPreview(metadata: Record<string, unknown>): string {
  const keys = Object.keys(metadata ?? {});
  if (keys.length === 0) return '';
  try {
    const json = JSON.stringify(metadata);
    return json.length > 140 ? json.slice(0, 137) + '…' : json;
  } catch {
    return `${keys.length} field${keys.length === 1 ? '' : 's'}`;
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireCampusAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.action)      q = q.eq('action', params.action);
  if (params.entity_type) q = q.eq('entity_type', params.entity_type);
  if (params.actor_id)    q = q.eq('actor_id', params.actor_id);

  const [listResult, actionsResult, entityTypesResult] = await Promise.all([
    q,
    supabase
      .from('audit_log')
      .select('action')
      .order('action')
      .limit(500),
    supabase
      .from('audit_log')
      .select('entity_type')
      .not('entity_type', 'is', null)
      .order('entity_type')
      .limit(500),
  ]);

  const entries = (listResult.data ?? []) as AuditEntry[];
  const total = listResult.count ?? entries.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const actions = Array.from(
    new Set((actionsResult.data ?? []).map((r) => r.action as string)),
  ).sort();
  const entityTypes = Array.from(
    new Set((entityTypesResult.data ?? []).map((r) => r.entity_type as string)),
  ).sort();

  const filtersActive = Boolean(params.action || params.entity_type || params.actor_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Every action staff and participants take is recorded here.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground-muted" htmlFor="action">
            Action
          </label>
          <select
            id="action"
            name="action"
            defaultValue={params.action ?? ''}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground-muted" htmlFor="entity_type">
            Entity type
          </label>
          <select
            id="entity_type"
            name="entity_type"
            defaultValue={params.entity_type ?? ''}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">All types</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {params.actor_id && (
          <input type="hidden" name="actor_id" value={params.actor_id} />
        )}

        <Button type="submit" size="sm">Apply</Button>
        {filtersActive && (
          <Link href="/audit">
            <Button type="button" variant="ghost" size="sm">Clear</Button>
          </Link>
        )}
      </form>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No audit entries</p>
          <p className="mt-1 text-sm text-foreground-muted">
            {filtersActive
              ? 'No entries match the current filters.'
              : 'Activity will appear here as staff and participants use the platform.'}
          </p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map((e) => (
              <TR key={e.id} className="hover:bg-surface-muted/60">
                <TD className="whitespace-nowrap text-foreground-muted">
                  {formatTimestamp(e.created_at)}
                </TD>
                <TD>
                  {e.actor_id ? (
                    <Link
                      href={`/audit${qs({
                        action: params.action,
                        entity_type: params.entity_type,
                        actor_id: e.actor_id,
                      })}`}
                      className="text-foreground hover:text-primary"
                    >
                      {e.actor_label ?? '—'}
                    </Link>
                  ) : (
                    <span className="text-foreground-muted">{e.actor_label ?? '—'}</span>
                  )}
                </TD>
                <TD>
                  <Badge tone="neutral">{e.action}</Badge>
                </TD>
                <TD className="text-foreground-muted">
                  {e.entity_type ? (
                    <span className="font-mono text-xs">
                      {e.entity_type}
                      {e.entity_id ? `:${e.entity_id.slice(0, 8)}` : ''}
                    </span>
                  ) : (
                    '—'
                  )}
                </TD>
                <TD className="max-w-md truncate font-mono text-xs text-foreground-subtle">
                  {metadataPreview(e.metadata)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-foreground-muted">
          <span>
            Page {page} of {pageCount} · {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/audit${qs({
                  action: params.action,
                  entity_type: params.entity_type,
                  actor_id: params.actor_id,
                  page: String(page - 1),
                })}`}
              >
                <Button variant="outline" size="sm">Previous</Button>
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/audit${qs({
                  action: params.action,
                  entity_type: params.entity_type,
                  actor_id: params.actor_id,
                  page: String(page + 1),
                })}`}
              >
                <Button variant="outline" size="sm">Next</Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
