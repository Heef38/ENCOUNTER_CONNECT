import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/dal';
import type { ParticipantStatus } from '@/lib/participants/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { deleteParticipantAccount } from '@/lib/participants/actions';
import { FLAGS, STAGES, getPipeline, type Flag, type Stage } from '@/lib/connect/pipeline';

const PAGE_SIZE = 25;

const STAGE_TONES: Record<Stage, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  new: 'info',
  contacted: 'warning',
  met: 'warning',
  plugged_in: 'success',
  serving: 'success',
  inactive: 'neutral',
};

interface SearchParams {
  stage?: string;
  flag?: string;
  campus_id?: string;
  page?: string;
}

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sms_consent_at: string | null;
  status: ParticipantStatus;
  last_personal_contact_at: string | null;
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
  const session = await requireStaff();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  // Full account deletion is church-admin+ only.
  const canDelete =
    (session.profile?.is_platform_admin ?? false) || session.profile?.role === 'church_admin';

  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Stage and flags come from the pipeline rule (migration 034), so this
  // list, This week and the Monday digest agree about who is where.
  const churchId = session.profile?.church_id ?? null;
  const pipeline = churchId ? await getPipeline(churchId) : [];
  const stageById = new Map(pipeline.map((r) => [r.participant_id, r]));
  const stageFilter = STAGES.some((s) => s.key === params.stage) ? (params.stage as Stage) : undefined;
  const flagFilter = params.flag && params.flag in FLAGS ? (params.flag as Flag) : undefined;
  const filteredIds =
    stageFilter || flagFilter
      ? pipeline
          .filter((r) => (!stageFilter || r.stage === stageFilter) && (!flagFilter || r.flags.includes(flagFilter)))
          .map((r) => r.participant_id)
      : null;

  let q = supabase
    .from('participants')
    .select(
      `id, first_name, last_name, email, phone, sms_consent_at, status, last_personal_contact_at,
       signed_up_at, last_action_at, created_at, current_step_id,
       campus:campuses(id, name),
       current_step:flow_steps!participants_current_step_id_fkey(id, title, order_index),
       progress:participant_progress(status)`,
      { count: 'exact' },
    )
    .order('last_action_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (churchId) q = q.eq('church_id', churchId);
  if (filteredIds) q = q.in('id', filteredIds.length > 0 ? filteredIds : ['00000000-0000-0000-0000-000000000000']);
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
            Everyone your church is welcoming in, by where they are and what they need next.
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
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1">
          {[{ key: '' as const, label: 'Everyone' }, ...STAGES].map((opt) => {
            const active = (params.stage ?? '') === opt.key;
            return (
              <Link
                key={opt.key || 'all'}
                href={`/participants${qs({ campus_id: params.campus_id, stage: opt.key || undefined, flag: params.flag })}`}
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

        <div className="flex flex-wrap gap-1">
          {(Object.keys(FLAGS) as Flag[]).map((f) => {
            const active = params.flag === f;
            return (
              <Link
                key={f}
                href={`/participants${qs({ campus_id: params.campus_id, stage: params.stage, flag: active ? undefined : f })}`}
                className={
                  'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ' +
                  (active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground-muted hover:text-foreground')
                }
              >
                {FLAGS[f].label}
              </Link>
            );
          })}
        </div>

        {campuses.length > 0 && (
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            <Link
              href={`/participants${qs({ stage: params.stage, flag: params.flag })}`}
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
                href={`/participants${qs({ stage: params.stage, flag: params.flag, campus_id: c.id })}`}
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
              <TH>Last reached</TH>
              <TH>Step</TH>
              <TH>Where they are</TH>
              {canDelete && <TH className="w-10" />}
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
                  <TD className="text-foreground-muted">
                    <span className="inline-flex items-center gap-1.5">
                      {contact}
                      {p.sms_consent_at && (
                        <span
                          title="Opted in to text messages"
                          className="rounded bg-success-bg px-1 text-[10px] font-semibold uppercase tracking-wide text-success"
                        >
                          SMS
                        </span>
                      )}
                    </span>
                  </TD>
                  <TD className="text-foreground-muted">
                    {formatDate(signedUp)}
                  </TD>
                  <TD className="text-foreground-muted">
                    {formatRelative(p.last_personal_contact_at)}
                  </TD>
                  <TD className="text-foreground-muted">
                    {stepTitle}
                    {total > 0 && <span className="text-foreground-subtle"> · {done}/{total}</span>}
                  </TD>
                  <TD>
                    {(() => {
                      const st = stageById.get(p.id);
                      if (!st) return <span className="text-foreground-subtle">—</span>;
                      return (
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={STAGE_TONES[st.stage]}>{STAGES.find((x) => x.key === st.stage)?.label}</Badge>
                          {st.flags.map((f) => (
                            <Badge key={f} tone={FLAGS[f].tone}>
                              {FLAGS[f].label}
                            </Badge>
                          ))}
                        </div>
                      );
                    })()}
                  </TD>
                  {canDelete && (
                    <TD>
                      <ConfirmDeleteButton
                        action={deleteParticipantAccount.bind(null, p.id)}
                        message={`Permanently delete ${p.first_name} ${p.last_name}'s account? This removes their login, journey, and assessment data and cannot be undone.`}
                        label="Delete"
                      />
                    </TD>
                  )}
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
                href={`/participants${qs({ stage: params.stage, flag: params.flag, campus_id: params.campus_id, page: String(page - 1) })}`}
              >
                <Button variant="outline" size="sm">
                  Previous
                </Button>
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/participants${qs({ stage: params.stage, flag: params.flag, campus_id: params.campus_id, page: String(page + 1) })}`}
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
