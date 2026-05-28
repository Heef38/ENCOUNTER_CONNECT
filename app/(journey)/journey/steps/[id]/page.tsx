import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Video, ExternalLink, CalendarDays, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import {
  selfMarkStepComplete,
  markEventAttended,
  submitAssessment,
  bookMatchedConnectorSlot,
} from '@/lib/journey/actions';
import {
  loadParticipantJourney,
  orderedProgress,
} from '@/lib/journey/queries';
import { CompleteStepButton } from './complete-step-button';
import { VideoEmbed } from './video-embed';
import { AssessmentForm } from './assessment-form';
import { AssessmentResults } from './assessment-results';
import { ConnectorSlotPicker } from './connector-slot-picker';
import { proposeConnectorSlots, type ProposedSlot } from '@/lib/connectors/match';
import type { FlowStepType, FlowOutputKind } from '@/lib/flows/types';
import type {
  AssessmentDefinition,
  AssessmentQuestion,
  AssessmentCategory,
  AssessmentKind,
  ComputedScore,
} from '@/lib/assessments/types';

interface ProgressRow {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  scheduled_event_id: string | null;
  participant: {
    id: string;
    profile_id: string | null;
    church_id: string;
    campus_id: string | null;
  };
  flow_step: {
    id: string;
    title: string;
    description: string | null;
    step_type: FlowStepType;
    appointment_type_id: string | null;
    assessment_kind: AssessmentKind | null;
    output_kind: FlowOutputKind;
    appointment_type: {
      id: string;
      name: string;
      duration_minutes: number;
    } | null;
  };
}

/**
 * Extracts a YouTube video id from watch / youtu.be / embed URLs.
 * Returns null for anything we don't recognize as YouTube.
 */
function youTubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

export default async function JourneyStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('participant_progress')
    .select(
      `id, status, scheduled_event_id,
       participant:participants!inner(id, profile_id, church_id, campus_id),
       flow_step:flow_steps!inner(
         id, title, description, step_type, appointment_type_id, assessment_kind, output_kind,
         appointment_type:scheduling_appointment_types(id, name, duration_minutes)
       )`,
    )
    .eq('id', id)
    .maybeSingle();

  const progress = data as unknown as ProgressRow | null;
  if (!progress || progress.participant.profile_id !== session.id) {
    notFound();
  }

  const { flow_step: step } = progress;
  const isComplete = progress.status === 'completed';

  // Navigation context: positional prev/next so the participant can move
  // back and forth to review any step.
  const journey = await loadParticipantJourney(supabase, session.id);
  const ordered = journey ? orderedProgress(journey) : [];
  const total = ordered.length;
  const idx = ordered.findIndex((s) => s.id === id);
  const prevId = idx > 0 ? ordered[idx - 1].id : null;
  const nextId = idx >= 0 && idx < total - 1 ? ordered[idx + 1].id : null;
  const stepNumber = idx >= 0 ? idx + 1 : 1;

  // A required step that isn't finished blocks moving forward (but you can
  // always go back to review). Optional steps can be passed without completing.
  const currentRequired = idx >= 0 ? ordered[idx].flow_step?.is_required ?? true : true;
  const forwardLocked = !isComplete && currentRequired;
  const canGoForward = nextId !== null && !forwardLocked;

  // ── Per-type extras ──────────────────────────────────────────
  type Booking = { id: string; starts_at: string; status: string };
  type VideoLesson = { id: string; title: string; body: string | null; video_url: string | null };
  let booking: Booking | null = null;
  let videoLessons: VideoLesson[] = [];
  let assessmentDefinition: AssessmentDefinition | null = null;
  let assessmentQuestions: AssessmentQuestion[] = [];
  let assessmentCategories: AssessmentCategory[] = [];
  let assessmentResult: { computed_score: ComputedScore } | null = null;

  if (step.step_type === 'video') {
    const { data: linkRows } = await supabase
      .from('flow_step_lessons')
      .select('order_index, lesson:lessons(id, title, body, video_url)')
      .eq('flow_step_id', step.id)
      .order('order_index');
    type Row = { order_index: number; lesson: VideoLesson | null };
    videoLessons = ((linkRows ?? []) as unknown as Row[])
      .map((r) => r.lesson)
      .filter((l): l is VideoLesson => l !== null);
  }

  if (step.step_type === 'schedule' && progress.scheduled_event_id) {
    const { data: bk } = await supabase
      .from('scheduling_bookings')
      .select('id, starts_at, status')
      .eq('id', progress.scheduled_event_id)
      .maybeSingle();
    booking = (bk as unknown as Booking) ?? null;
  }

  let proposedSlots: ProposedSlot[] = [];
  if (
    step.step_type === 'schedule'
    && step.output_kind === 'auto_match_connector'
    && step.appointment_type_id
    && progress.participant.campus_id
    && !booking
  ) {
    const admin = await createServiceRoleClient();
    proposedSlots = await proposeConnectorSlots(admin, {
      campusId: progress.participant.campus_id,
      appointmentTypeId: step.appointment_type_id,
    });
  }

  const existingResponses = new Map<string, unknown>();
  if (step.step_type === 'assessment' && step.assessment_kind) {
    const { data: def } = await supabase
      .from('assessment_definitions')
      .select('*')
      .eq('church_id', progress.participant.church_id)
      .eq('kind', step.assessment_kind)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (def) {
      assessmentDefinition = def as AssessmentDefinition;
      const [qs, cats, existing, result] = await Promise.all([
        supabase.from('assessment_questions').select('*').eq('assessment_id', def.id).order('order_index'),
        supabase.from('assessment_categories').select('*').eq('assessment_id', def.id).order('order_index'),
        supabase
          .from('assessment_responses')
          .select('question_id, response_value')
          .eq('participant_id', progress.participant.id)
          .eq('assessment_id', def.id),
        supabase
          .from('assessment_results')
          .select('computed_score')
          .eq('participant_id', progress.participant.id)
          .eq('assessment_id', def.id)
          .maybeSingle(),
      ]);
      assessmentQuestions = (qs.data ?? []) as AssessmentQuestion[];
      assessmentCategories = (cats.data ?? []) as AssessmentCategory[];
      if (existing.data) {
        for (const r of existing.data) existingResponses.set(r.question_id as string, r.response_value);
      }
      if (result.data) assessmentResult = result.data as { computed_score: ComputedScore };
    }
  }

  // ── Server actions bound to this step ────────────────────────
  async function completeAction() {
    'use server';
    await selfMarkStepComplete(id);
  }
  async function attendAction() {
    'use server';
    await markEventAttended(id);
  }
  async function bookAction(startsAtIso: string) {
    'use server';
    return bookMatchedConnectorSlot(id, startsAtIso);
  }
  async function submitAction(_prev: unknown, formData: FormData) {
    'use server';
    if (!assessmentDefinition || !step.assessment_kind) {
      return { ok: false, error: 'No assessment configured for this step.' };
    }
    return submitAssessment(id, assessmentDefinition.id, step.assessment_kind, formData);
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Scrollable content */}
      <div className="flex-1 space-y-5 px-4 py-5">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {step.title}
          </h1>
          {step.description && (
            <p className="mt-2 text-base text-foreground-muted">{step.description}</p>
          )}
        </div>

        {step.step_type === 'schedule' && (
          <div className="space-y-4">
            {step.appointment_type ? (
              <p className="text-base text-foreground-muted">
                You&apos;ll be booking a{' '}
                <span className="font-medium text-foreground">{step.appointment_type.name}</span>
                {step.appointment_type.duration_minutes ? ` (${step.appointment_type.duration_minutes} min)` : ''}.
              </p>
            ) : (
              <p className="text-base text-foreground-muted">
                Book your appointment to complete this step.
              </p>
            )}

            {booking ? (
              <div className="rounded-md border border-success/40 bg-success-bg/50 p-3 text-sm">
                <p className="font-medium text-foreground">Booking on file</p>
                <p className="text-foreground-muted">
                  {new Date(booking.starts_at).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {' · '}
                  {booking.status}
                </p>
              </div>
            ) : step.output_kind === 'auto_match_connector' ? (
              <ConnectorSlotPicker
                progressId={progress.id}
                proposedSlots={proposedSlots}
                fallbackHref={
                  step.appointment_type_id
                    ? `/scheduling/new-booking?type=${step.appointment_type_id}&progress=${progress.id}`
                    : '/scheduling/new-booking'
                }
                bookAction={bookAction}
              />
            ) : (
              <Link
                href={
                  step.appointment_type_id
                    ? `/scheduling/new-booking?type=${step.appointment_type_id}&progress=${progress.id}`
                    : '/scheduling/new-booking'
                }
              >
                <Button className="w-full">
                  <CalendarDays className="h-4 w-4" />
                  Book your appointment
                </Button>
              </Link>
            )}
          </div>
        )}

        {step.step_type === 'video' && (
          <div>
            {videoLessons.length === 0 ? (
              <p className="text-base text-foreground-muted">
                No videos have been added to this step yet. Reach out to your campus team.
              </p>
            ) : (
              <ul className="space-y-5">
                {videoLessons.map((l) => {
                  const vid = youTubeId(l.video_url);
                  return (
                    <li
                      key={l.id}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      {vid ? (
                        <VideoEmbed videoId={vid} title={l.title} />
                      ) : l.video_url ? (
                        <a
                          href={l.video_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-3 bg-surface-muted/40 p-3 hover:bg-surface-muted"
                        >
                          <Video className="h-5 w-5 flex-none text-primary" />
                          <span className="flex-1 text-base font-medium text-foreground">{l.title}</span>
                          <ExternalLink className="h-4 w-4 text-foreground-subtle" />
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 bg-surface-muted/40 p-3">
                          <Video className="h-5 w-5 flex-none text-foreground-subtle" />
                          <span className="flex-1 text-base text-foreground">{l.title}</span>
                        </div>
                      )}
                      <div className="px-3 py-2.5">
                        <p className="text-base font-medium text-foreground">{l.title}</p>
                        {l.body && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-muted">{l.body}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {step.step_type === 'event' && (
          <p className="text-base text-foreground-muted">
            Attend the event, then mark it complete here.
          </p>
        )}

        {(step.step_type === 'manual' || step.step_type === 'conversation') && (
          <p className="text-base text-foreground-muted">
            {step.step_type === 'conversation'
              ? "Your connector will reach out for a conversation. Once you've had it, mark this step complete."
              : 'Take care of this step at your own pace, then mark it complete.'}
          </p>
        )}

        {step.step_type === 'assessment' && (
          <>
            {!assessmentDefinition ? (
              <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
                This assessment hasn&apos;t been configured yet. Reach out to your campus team.
              </div>
            ) : assessmentQuestions.length === 0 ? (
              <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
                No questions have been added to this assessment yet.
              </div>
            ) : isComplete && assessmentResult ? (
              <AssessmentResults computed={assessmentResult.computed_score} categories={assessmentCategories} />
            ) : (
              <AssessmentForm
                questions={assessmentQuestions}
                existingResponses={Object.fromEntries(existingResponses.entries())}
                action={submitAction}
                isComplete={isComplete}
              />
            )}
          </>
        )}
      </div>

      {/* Sticky nav: ← previous · action · next → */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          {prevId ? (
            <Link
              href={`/journey/steps/${prevId}`}
              aria-label="Previous step"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border text-foreground transition hover:bg-surface-muted"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <span
              aria-hidden
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border text-foreground-subtle opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </span>
          )}

          <div className="flex flex-1 items-center justify-center px-1">
            {isComplete ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                Completed
              </span>
            ) : step.step_type === 'event' ? (
              <CompleteStepButton action={attendAction} label="Mark attended" />
            ) : step.step_type === 'video' ? (
              <CompleteStepButton action={completeAction} label="Completed?" />
            ) : step.step_type === 'schedule' ? (
              <CompleteStepButton action={completeAction} label="I've completed this" />
            ) : step.step_type === 'manual' || step.step_type === 'conversation' ? (
              <CompleteStepButton action={completeAction} label="Mark complete" />
            ) : null}
          </div>

          {canGoForward ? (
            <Link
              href={`/journey/steps/${nextId}`}
              aria-label="Next step"
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border text-foreground transition hover:bg-surface-muted"
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          ) : (
            <span
              aria-hidden
              title={forwardLocked ? 'Complete this step to continue' : undefined}
              className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-border text-foreground-subtle opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </span>
          )}
        </div>

        <p className="mt-2 text-center text-xs text-foreground-subtle">
          Step {stepNumber} of {total}
        </p>
      </div>
    </div>
  );
}
