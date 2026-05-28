import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireStaff } from '@/lib/auth/dal';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_TONES: Record<string, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  new:         'info',
  in_progress: 'warning',
  connected:   'success',
  completed:   'neutral',
  inactive:    'danger',
};

const PROGRESS_BORDER: Record<string, string> = {
  pending:     'border-l-border bg-surface',
  in_progress: 'border-l-warning bg-warning-bg/40',
  completed:   'border-l-success bg-success-bg/40',
  skipped:     'border-l-border bg-surface-muted/40',
};

const STEP_TYPE_LABELS: Record<string, string> = {
  manual:       'Manual',
  schedule:     'Schedule Meeting',
  event:        'Event',
  conversation: 'Conversation',
  assessment:   'Assessment',
};

const PROGRESS_TONES: Record<string, 'success' | 'warning' | 'neutral'> = {
  completed:   'success',
  in_progress: 'warning',
  pending:     'neutral',
  skipped:     'neutral',
};

export default async function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: participant, error } = await supabase
    .from('participants')
    .select(
      `*,
       campus:campuses(id, name),
       connector:connectors(
         id,
         profile:profiles(first_name, last_name, email)
       )`,
    )
    .eq('id', id)
    .single();

  if (error || !participant) notFound();

  const { data: progress } = await supabase
    .from('participant_progress')
    .select(
      `*, flow_step:flow_steps(id, title, description, step_type, order_index, is_required,
         flow:flows(id, name)
       )`,
    )
    .eq('participant_id', id)
    .order('order_index', { referencedTable: 'flow_steps' });

  const connector = participant.connector as unknown as {
    id: string;
    profile: { first_name: string; last_name: string; email: string | null };
  } | null;
  const campus = participant.campus as { id: string; name: string } | null;

  const completedCount = (progress ?? []).filter((p) => p.status === 'completed').length;
  const totalCount = (progress ?? []).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/participants"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Participants
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {participant.first_name} {participant.last_name}
          </h1>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {participant.email ?? 'No email'}
          </p>
        </div>
        <Badge tone={STATUS_TONES[participant.status] ?? 'neutral'}>
          {participant.status.replace('_', ' ')}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Details
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-foreground-muted">Campus</dt>
                <dd className="text-foreground">{campus?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-foreground-muted">Phone</dt>
                <dd className="text-foreground">{participant.phone ?? '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-foreground-muted">Texts</dt>
                <dd>
                  {participant.sms_consent_at ? (
                    <Badge tone="success">Opted in</Badge>
                  ) : (
                    <span className="text-foreground-subtle">Not opted in</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-foreground-muted">Added</dt>
                <dd className="text-foreground">
                  {new Date(participant.created_at).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Connector
            </h2>
            {connector ? (
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {connector.profile.first_name} {connector.profile.last_name}
                </p>
                <p className="text-foreground-muted">{connector.profile.email ?? '—'}</p>
                <Link
                  href={`/connectors/${connector.id}`}
                  className="mt-2 block text-xs text-primary hover:underline"
                >
                  View connector →
                </Link>
              </div>
            ) : (
              <p className="text-sm text-foreground-subtle">No connector assigned.</p>
            )}
          </div>

          {participant.notes && (
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Notes
              </h2>
              <p className="text-sm text-foreground-muted">{participant.notes}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-medium text-foreground">Journey Progress</h2>
              {totalCount > 0 && (
                <span className="text-xs text-foreground-subtle">
                  {completedCount} / {totalCount} steps complete
                </span>
              )}
            </div>

            {progress && progress.length > 0 ? (
              <div className="divide-y divide-border">
                {progress.map((item) => {
                  const step = item.flow_step as unknown as {
                    id: string;
                    title: string;
                    description: string | null;
                    step_type: string;
                    order_index: number;
                    is_required: boolean;
                    flow: { id: string; name: string } | null;
                  };
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-start gap-3 border-l-4 px-5 py-4',
                        PROGRESS_BORDER[item.status] ?? PROGRESS_BORDER.pending,
                      )}
                    >
                      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-foreground-muted">
                        {step.order_index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{step.title}</p>
                          {!step.is_required && (
                            <span className="text-xs text-foreground-subtle">optional</span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-foreground-muted">
                          {STEP_TYPE_LABELS[step.step_type] ?? step.step_type}
                          {step.flow && (
                            <span className="ml-2 text-foreground-subtle">· {step.flow.name}</span>
                          )}
                        </p>
                        {item.completed_at && (
                          <p className="mt-0.5 text-xs text-success">
                            Completed {new Date(item.completed_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Badge tone={PROGRESS_TONES[item.status] ?? 'neutral'}>
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-foreground-subtle">
                No flow assigned yet.
                <br />
                <Link href="/flows" className="mt-1 block text-primary hover:underline">
                  View available flows →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
