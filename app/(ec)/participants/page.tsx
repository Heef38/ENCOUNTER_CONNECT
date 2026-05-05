import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/dal';
import type { ParticipantStatus } from '@/lib/participants/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: ParticipantStatus | ''; label: string }[] = [
  { value: '',            label: 'All' },
  { value: 'new',         label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'connected',   label: 'Connected' },
  { value: 'completed',   label: 'Completed' },
  { value: 'inactive',    label: 'Inactive' },
];

const STATUS_TONES: Record<
  string,
  'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary'
> = {
  new:         'info',
  in_progress: 'warning',
  connected:   'success',
  completed:   'neutral',
  inactive:    'danger',
};

interface SearchParams {
  status?: string;
  campus_id?: string;
  page?: string;
}

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: ParticipantStatus;
  signed_up_at: string | null;
  last_action_at: string | null;
  created_at: string;
  current_step_id: string | null;
  campus: { id: string; name: string } | null;
  current_step: { id: string; title: string; order_index: number } | null;
  progress: { status: string }[] | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries as [string, string][]).toString();
}

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStaff();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from('participants')
    .select(
      `id, first_name, last_name, email, phone, status,
       signed_up_at, last_action_at, created_at, current_step_id,
       campus:campuses(id, name),
       current_step:flow_steps!participants_current_step_id_fkey(id, title, order_index),
       progress:participant_progress(status)`,
      { count: 'exact' },
    )
    .order('last_action_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (params.status)    q = q.eq('status', params.status);
  if (params.campus_id) q = q.eq('campus_id', params.campus_id);

  const [listResult, campusesResult] = await Promise.all([
    q,
    supabase
      .from('campuses')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ]);

  const participants = (listResult.data ?? []) as unknown as Row[];
  const total = listResult.count ?? participants.length;
  const campuses = campusesResult.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Participants
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Everyone moving through the connection journey.
          </p>
        </div>
        <Link href="/participants/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            Add participant
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
          {STATUS_OPTIONS.map((opt) => {
            const active =
              params.status === opt.value || (!params.status && opt.value === '');
            return (
              <Link
                key={opt.value || 'all'}
                href={`/participants${qs({ campus_id: params.campus_id, status: opt.value || undefined })}`}
                className={
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                  (active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground')
                }
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {campuses.length > 0 && (
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            <Link
              href={`/participants${qs({ status: params.status })}`}
              className={
                'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                (!params.campus_id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground')
              }
            >
              All campuses
            </Link>
            {campuses.map((c) => (
              <Link
                key={c.id}
                href={`/participants${qs({ status: params.status, campus_id: c.id })}`}
                className={
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                  (params.campus_id === c.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground')
                }
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {participants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-10 text-center">
          <p className="text-sm font-medium text-foreground">No participants yet</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Add your first participant to start the journey.
          </p>
          <Link href="/participants/new" className="mt-4 inline-block">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add participant
            </Button>
          </Link>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Campus</TH>
              <TH>Contact</TH>
              <TH>Signed up</TH>
              <TH>Last action</TH>
              <TH>Step</TH>
              <TH>Progress</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {participants.map((p) => {
              const progress = p.progress ?? [];
              const total = progress.length;
              const done = progress.filter((r) => r.status === 'completed').length;
              const contact = p.email || p.phone || '—';
              const signedUp = p.signed_up_at ?? p.created_at;
              const stepTitle = p.current_step?.title ?? '—';

              return (
                <TR key={p.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link
                      href={`/participants/${p.id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {p.first_name} {p.last_name}
                    </Link>
                  </TD>
                  <TD className="text-foreground-muted">
                    {p.campus?.name ?? '—'}
                  </TD>
                  <TD className="text-foreground-muted">{contact}</TD>
                  <TD className="text-foreground-muted">
                    {formatDate(signedUp)}
                  </TD>
                  <TD className="text-foreground-muted">
                    {formatRelative(p.last_action_at)}
                  </TD>
                  <TD className="text-foreground-muted">{stepTitle}</TD>
                  <TD className="text-foreground-muted">
                    {total === 0 ? '—' : `${done} of ${total}`}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONES[p.status] ?? 'neutral'}>
                      {p.status.replace('_', ' ')}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
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
                href={`/participants${qs({ status: params.status, campus_id: params.campus_id, page: String(page - 1) })}`}
              >
                <Button variant="outline" size="sm">
                  Previous
                </Button>
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/participants${qs({ status: params.status, campus_id: params.campus_id, page: String(page + 1) })}`}
              >
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
