import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  Check,
  Lock,
  Mail,
  Phone,
  MessageSquare,
  CalendarDays,
  ClipboardList,
  Sparkles,
} from 'lucide-react';
import { requireConnector } from '@/lib/auth/dal';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getConnectorParticipantAccess } from '@/lib/connectors/journey-queries';
import {
  connectorConfirmBooking,
  connectorDeclineBooking,
} from '@/lib/connectors/booking-actions';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookingDecision } from './booking-decision';
import { generateOneOnOneDoc, KIND_LABEL } from '@/lib/connectors/prep-doc';
import type { FlowStepType } from '@/lib/flows/types';
import type { AssessmentKind, ComputedScore, AssessmentCategory } from '@/lib/assessments/types';

interface ProgressRow {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  scheduled_event_id: string | null;
  meeting_completed_at: string | null;
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
  phone: string | null;
  sms_consent_at: string | null;
  status: string;
  signed_up_at: string | null;
  last_action_at: string | null;
  campus: { id: string; name: string } | null;
  progress: ProgressRow[] | null;
}

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
      `id, first_name, last_name, email, phone, sms_consent_at, status, signed_up_at, last_action_at,
       campus:campuses(id, name),
       progress:participant_progress(
         id, status, completed_at, scheduled_event_id, meeting_completed_at,
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

  // Meetings linked to this participant's progress. Read via service-role —
  // bookings live in the scheduling core, which connectors can't read under
  // RLS (access is already gated by getConnectorParticipantAccess above).
  type Meeting = {
    booking_id: string;
    starts_at: string;
    status: string;
  };
  const scheduledBookingIds = progress
    .map((p) => (p as ProgressRow & { scheduled_event_id?: string | null }).scheduled_event_id ?? null)
    .filter((id): id is string => !!id);

  let meetings: Meeting[] = [];
  if (scheduledBookingIds.length > 0) {
    const admin = await createServiceRoleClient();
    const { data: bookingRows } = await admin
      .from('scheduling_bookings')
      .select('id, starts_at, status')
      .in('id', scheduledBookingIds)
      .not('status', 'in', '("cancelled","rescheduled","no_show")')
      .order('starts_at');
    meetings = ((bookingRows ?? []) as Array<{ id: string; starts_at: string; status: string }>).map(
      (b) => ({ booking_id: b.id, starts_at: b.starts_at, status: b.status }),
    );
  }
  // Map each booking back to its progress row so we can open the meeting room,
  // and track which meetings the connector has marked finished.
  const progressByBooking = new Map<string, string>();
  const meetingDoneBookings = new Set<string>();
  for (const p of progress) {
    const b = p.scheduled_event_id;
    if (b) {
      progressByBooking.set(b, p.id);
      if (p.meeting_completed_at) meetingDoneBookings.add(b);
    }
  }

  const isDone = (m: Meeting) => m.status === 'completed' || meetingDoneBookings.has(m.booking_id);
  const pendingMeetings = meetings.filter((m) => m.status === 'pending_confirmation' && !isDone(m));
  const completedMeetings = meetings.filter((m) => isDone(m));
  const upcomingMeetings = meetings.filter((m) => m.status !== 'pending_confirmation' && !isDone(m));

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
          {participant.phone && (
            <span className="inline-flex items-center gap-1 text-xs">
              <Phone className="h-3 w-3 text-foreground-subtle" />
              {participant.sms_consent_at ? (
                <a
                  href={`sms:${participant.phone}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  title="Opted in to text messages"
                >
                  {participant.phone}
                  <MessageSquare className="h-3 w-3" />
                </a>
              ) : (
                <span
                  className="text-foreground-subtle"
                  title="Has not opted in to text messages — do not text"
                >
                  {participant.phone} · no SMS consent
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {meetings.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarDays className="h-4 w-4" />
            Meeting
          </h2>

          {/* Pending: needs the connector's confirm/decline (when assigned). */}
          {pendingMeetings.map((b) =>
            access.canWrite ? (
              <BookingDecision
                key={b.booking_id}
                bookingId={b.booking_id}
                startsAt={b.starts_at}
                confirmAction={confirmAction}
                declineAction={declineAction}
              />
            ) : (
              <div
                key={b.booking_id}
                className="rounded-lg border border-warning/40 bg-warning-bg/40 p-4 text-sm"
              >
                <p className="font-medium text-foreground">Awaiting confirmation</p>
                <p className="text-foreground-muted">
                  {new Date(b.starts_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                </p>
              </div>
            ),
          )}

          {/* Confirmed / scheduled: just show it. */}
          {upcomingMeetings.map((b) => (
            <div
              key={b.booking_id}
              className="rounded-lg border border-success/40 bg-success-bg/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success/15 text-success">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Scheduled meeting</p>
                    <p className="mt-0.5 text-sm text-foreground-muted">
                      {new Date(b.starts_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
                {access.canWrite && progressByBooking.get(b.booking_id) && (
                  <Link href={`/connector/participants/${id}/meeting/${progressByBooking.get(b.booking_id)}`}>
                    <Button size="sm">Start meeting</Button>
                  </Link>
                )}
              </div>
            </div>
          ))}

          {/* Completed meetings. */}
          {completedMeetings.map((b) => (
            <div
              key={b.booking_id}
              className="rounded-lg border border-border bg-surface-muted/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Meeting completed</p>
                    <p className="mt-0.5 text-sm text-foreground-muted">
                      {new Date(b.starts_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
                {access.canWrite && progressByBooking.get(b.booking_id) && (
                  <Link href={`/connector/participants/${id}/meeting/${progressByBooking.get(b.booking_id)}`}>
                    <Button size="sm" variant="outline">View notes</Button>
                  </Link>
                )}
              </div>
            </div>
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
