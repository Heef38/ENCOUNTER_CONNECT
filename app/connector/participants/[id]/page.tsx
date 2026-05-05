import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  Check,
  Lock,
  Mail,
  CalendarDays,
  ClipboardList,
  Sparkles,
} from 'lucide-react';
import { requireConnector } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getConnectorParticipantAccess } from '@/lib/connectors/journey-queries';
import {
  connectorConfirmBooking,
  connectorDeclineBooking,
} from '@/lib/connectors/booking-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookingDecision } from './booking-decision';
import type { FlowStepType } from '@/lib/flows/types';
import type { AssessmentKind, ComputedScore, AssessmentCategory } from '@/lib/assessments/types';

interface ProgressRow {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  scheduled_event_id: string | null;
  flow_step: {
    id: string;
    title: string;
    step_type: FlowStepType;
    order_index: number;
    phase_index: number;
    is_required: boolean;
  } | null;
}

interface ParticipantData {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  signed_up_at: string | null;
  last_action_at: string | null;
  campus: { id: string; name: string } | null;
  progress: ProgressRow[] | null;
}

const KIND_LABEL: Record<AssessmentKind, string> = {
  personal:         'Personal',
  connect_with_god: 'Connect with God',
  spiritual_gifts:  'Spiritual Gifts',
};

export default async function ConnectorParticipantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { connectorId } = await requireConnector();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const access = await getConnectorParticipantAccess(supabase, connectorId, id);
  if (!access.canRead) notFound();

  const { data } = await supabase
    .from('participants')
    .select(
      `id, first_name, last_name, email, status, signed_up_at, last_action_at,
       campus:campuses(id, name),
       progress:participant_progress(
         id, status, completed_at, scheduled_event_id,
         flow_step:flow_steps(id, title, step_type, order_index, phase_index, is_required)
       )`,
    )
    .eq('id', id)
    .maybeSingle();

  const participant = data as unknown as ParticipantData | null;
  if (!participant) notFound();

  const progress = (participant.progress ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.flow_step?.order_index ?? 0) - (b.flow_step?.order_index ?? 0),
    );
  const total = progress.length;
  const done = progress.filter((p) => p.status === 'completed').length;

  // Pull every completed assessment result + categories.
  type AssessmentDef = {
    id: string;
    kind: AssessmentKind;
    name: string;
  };
  type ResultRow = {
    assessment_id: string;
    completed_at: string;
    computed_score: ComputedScore;
    assessment: AssessmentDef | null;
  };

  const { data: resultRows } = await supabase
    .from('assessment_results')
    .select(
      `assessment_id, completed_at, computed_score,
       assessment:assessment_definitions(id, kind, name)`,
    )
    .eq('participant_id', participant.id);

  const results: ResultRow[] = ((resultRows ?? []) as unknown as ResultRow[]).filter(
    (r) => r.assessment !== null,
  );

  // Pull category bodies for the assessments the participant has completed.
  const categoriesByAssessment = new Map<string, AssessmentCategory[]>();
  if (results.length > 0) {
    const { data: cats } = await supabase
      .from('assessment_categories')
      .select('*')
      .in(
        'assessment_id',
        results.map((r) => r.assessment_id),
      )
      .order('order_index');
    for (const c of (cats ?? []) as AssessmentCategory[]) {
      const list = categoriesByAssessment.get(c.assessment_id) ?? [];
      list.push(c);
      categoriesByAssessment.set(c.assessment_id, list);
    }
  }

  const oneOnOneDoc = generateOneOnOneDoc({
    participant,
    progress,
    results,
    categoriesByAssessment,
  });

  // Pending bookings the connector needs to confirm/decline. We pull every
  // booking linked to this participant's progress that's still pending.
  type PendingBooking = {
    booking_id: string;
    starts_at: string;
  };
  const scheduledBookingIds = progress
    .map((p) => (p as ProgressRow & { scheduled_event_id?: string | null }).scheduled_event_id ?? null)
    .filter((id): id is string => !!id);

  let pendingBookings: PendingBooking[] = [];
  if (access.canWrite && scheduledBookingIds.length > 0) {
    const { data: bookingRows } = await supabase
      .from('scheduling_bookings')
      .select('id, starts_at, status')
      .in('id', scheduledBookingIds)
      .eq('status', 'pending_confirmation');
    pendingBookings = ((bookingRows ?? []) as Array<{ id: string; starts_at: string }>).map(
      (b) => ({ booking_id: b.id, starts_at: b.starts_at }),
    );
  }

  async function confirmAction(bookingId: string) {
    'use server';
    return connectorConfirmBooking(bookingId);
  }
  async function declineAction(bookingId: string) {
    'use server';
    return connectorDeclineBooking(bookingId);
  }

  return (
    <div className="space-y-8">
      <Link
        href="/connector"
        className="inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        My participants
      </Link>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {participant.first_name} {participant.last_name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
          {participant.campus && <span>{participant.campus.name}</span>}
          <Badge tone="neutral">{participant.status.replace('_', ' ')}</Badge>
          {!access.canWrite && (
            <Badge tone="warning">Read-only — not assigned to you</Badge>
          )}
          {participant.email && (
            <a
              href={`mailto:${participant.email}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Mail className="h-3 w-3" />
              {participant.email}
            </a>
          )}
        </div>
      </div>

      {pendingBookings.length > 0 && (
        <section className="space-y-3">
          {pendingBookings.map((b) => (
            <BookingDecision
              key={b.booking_id}
              bookingId={b.booking_id}
              startsAt={b.starts_at}
              confirmAction={confirmAction}
              declineAction={declineAction}
            />
          ))}
        </section>
      )}

      {/* Progress summary */}
      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Journey progress
            </span>
            <span className="text-xs text-foreground-subtle">
              {done} of {total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${total === 0 ? 0 : Math.round((done / total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Step list */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Steps</h2>
        <ul className="space-y-1">
          {progress.map((p) => {
            if (!p.flow_step) return null;
            const state =
              p.status === 'completed'
                ? 'done'
                : p.status === 'in_progress'
                ? 'current'
                : p.status === 'skipped'
                ? 'skipped'
                : 'locked';
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 rounded-md border p-3 ${
                  state === 'current'
                    ? 'border-primary/40 bg-primary/5'
                    : state === 'done'
                    ? 'border-border bg-surface-muted/30'
                    : 'border-border bg-surface'
                }`}
              >
                <div
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${
                    state === 'done'
                      ? 'bg-success text-white'
                      : state === 'current'
                      ? 'bg-primary text-white'
                      : 'bg-surface-muted text-foreground-subtle'
                  }`}
                >
                  {state === 'done' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : state === 'locked' ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                </div>
                <span
                  className={`flex-1 text-sm ${
                    state === 'done'
                      ? 'text-foreground-muted line-through decoration-foreground-subtle'
                      : 'text-foreground'
                  }`}
                >
                  {p.flow_step.title}
                </span>
                <Badge
                  tone={
                    state === 'done' ? 'success' : state === 'current' ? 'info' : 'neutral'
                  }
                >
                  {p.status.replace('_', ' ')}
                </Badge>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Assessment results */}
      {results.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ClipboardList className="h-4 w-4" />
            Assessment results
          </h2>
          <div className="space-y-3">
            {results.map((r) => {
              const cats = categoriesByAssessment.get(r.assessment_id) ?? [];
              const top = r.computed_score?.top ?? [];
              return (
                <Card key={r.assessment_id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {r.assessment ? KIND_LABEL[r.assessment.kind] : 'Assessment'}
                      </p>
                      <span className="text-xs text-foreground-subtle">
                        Completed{' '}
                        {new Date(r.completed_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {top.length > 0 ? (
                      <ol className="space-y-2">
                        {top.map((t, i) => {
                          const cat = cats.find((c) => c.id === t.category_id);
                          return (
                            <li key={t.category_id} className="rounded-md border border-border bg-surface p-3">
                              <div className="flex items-baseline justify-between">
                                <p className="text-sm font-medium text-foreground">
                                  {i + 1}. {t.label}
                                </p>
                                <span className="text-xs text-foreground-subtle">
                                  {t.points.toFixed(1)} pts
                                </span>
                              </div>
                              {cat?.body && (
                                <p className="mt-2 whitespace-pre-wrap text-xs text-foreground-muted">
                                  {cat.body}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="text-xs text-foreground-muted">
                        No top categories computed.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* One-on-one prep doc */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4" />
          One-on-one prep
        </h2>
        <Card>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
              {oneOnOneDoc}
            </pre>
          </CardContent>
        </Card>
        <p className="text-xs text-foreground-subtle">
          Auto-generated from this participant&apos;s journey + assessment results.
          Use it as a starting point during your meeting.
        </p>
      </section>
    </div>
  );
}

/**
 * Builds a markdown-flavored prep doc the connector reads during their
 * meeting. Renders as plain text via <pre> until a markdown library lands.
 */
function generateOneOnOneDoc(input: {
  participant: ParticipantData;
  progress: ProgressRow[];
  results: Array<{
    assessment_id: string;
    computed_score: ComputedScore;
    assessment: { kind: AssessmentKind; name: string } | null;
  }>;
  categoriesByAssessment: Map<string, AssessmentCategory[]>;
}): string {
  const { participant, progress, results, categoriesByAssessment } = input;
  const lines: string[] = [];

  lines.push(`# 1:1 prep — ${participant.first_name} ${participant.last_name}`);
  lines.push('');

  lines.push('## Where they are');
  if (participant.campus) lines.push(`- Campus: ${participant.campus.name}`);
  lines.push(`- Status: ${participant.status.replace('_', ' ')}`);
  if (participant.signed_up_at) {
    lines.push(
      `- Signed up: ${new Date(participant.signed_up_at).toLocaleDateString()}`,
    );
  }
  const completedTitles = progress
    .filter((p) => p.status === 'completed' && p.flow_step)
    .map((p) => p.flow_step!.title);
  if (completedTitles.length > 0) {
    lines.push('- Completed:');
    for (const t of completedTitles) lines.push(`  - ${t}`);
  }
  const currentTitles = progress
    .filter((p) => p.status === 'in_progress' && p.flow_step)
    .map((p) => p.flow_step!.title);
  if (currentTitles.length > 0) {
    lines.push('- Currently working on:');
    for (const t of currentTitles) lines.push(`  - ${t}`);
  }
  lines.push('');

  if (results.length > 0) {
    lines.push('## Assessment highlights');
    for (const r of results) {
      const kindLabel = r.assessment ? KIND_LABEL[r.assessment.kind] : 'Assessment';
      lines.push(`### ${kindLabel}`);
      const top = r.computed_score?.top ?? [];
      const cats = categoriesByAssessment.get(r.assessment_id) ?? [];
      if (top.length === 0) {
        lines.push('_No top categories computed._');
      } else {
        for (const t of top) {
          lines.push(`- **${t.label}** — ${t.points.toFixed(1)} pts`);
          const body = cats.find((c) => c.id === t.category_id)?.body;
          if (body) {
            const trimmed = body.length > 220 ? `${body.slice(0, 220)}…` : body;
            lines.push(`  ${trimmed.replace(/\n+/g, ' ')}`);
          }
        }
      }
      lines.push('');
    }

    lines.push('## Suggested conversation starters');
    for (const r of results) {
      const kindLabel = r.assessment ? KIND_LABEL[r.assessment.kind] : 'Assessment';
      const top = r.computed_score?.top ?? [];
      if (top.length === 0) continue;
      lines.push(`- ${kindLabel}: "Tell me about a time you've experienced ${top[0].label.toLowerCase()}."`);
    }
    lines.push('');
  } else {
    lines.push('## Assessments');
    lines.push('_No assessments completed yet — let\'s talk about how the journey is going so far._');
    lines.push('');
  }

  lines.push('## Notes from this meeting');
  lines.push('_(jot down what you talk about — pen-and-paper for now)_');

  return lines.join('\n');
}
