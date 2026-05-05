import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, CalendarDays, Video, ExternalLink } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  selfMarkStepComplete,
  markEventAttended,
  submitAssessment,
} from '@/lib/journey/actions';
import { CompleteStepButton } from './complete-step-button';
import { AssessmentForm } from './assessment-form';
import { AssessmentResults } from './assessment-results';
import type { FlowStepType, FlowOutputKind } from '@/lib/flows/types';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { proposeConnectorSlots, type ProposedSlot } from '@/lib/connectors/match';
import { bookMatchedConnectorSlot } from '@/lib/journey/actions';
import { ConnectorSlotPicker } from './connector-slot-picker';
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
 * Best-effort YouTube embed. Recognizes youtube.com/watch?v=, youtu.be/<id>,
 * and youtube.com/embed/<id>. Returns null for unrecognized URLs so the caller
 * can fall back to a plain link.
 */
function toYouTubeEmbed(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return v ? `https://www.youtube.com/embed/${v}` : null;
      }
      if (u.pathname.startsWith('/embed/')) return url;
    }
  } catch {
    return null;
  }
  return null;
}

const STATUS_LABEL: Record<ProgressRow['status'], string> = {
  pending:     'Pending',
  in_progress: 'In progress',
  completed:   'Completed',
  skipped:     'Skipped',
};

const STATUS_TONE: Record<ProgressRow['status'], 'neutral' | 'info' | 'success'> = {
  pending:     'neutral',
  in_progress: 'info',
  completed:   'success',
  skipped:     'neutral',
};

export default async function JourneyStepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();

  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  if (isPlatform || (role && role !== 'participant')) {
    redirect('/dashboard');
  }

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

  // Per-type extras
  type Booking = { id: string; starts_at: string; status: string };
  type VideoLesson = {
    id: string;
    title: string;
    body: string | null;
    video_url: string | null;
  };
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

  // For schedule steps with auto-match output, propose 3 connector slots.
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
        supabase
          .from('assessment_questions')
          .select('*')
          .eq('assessment_id', def.id)
          .order('order_index'),
        supabase
          .from('assessment_categories')
          .select('*')
          .eq('assessment_id', def.id)
          .order('order_index'),
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
        for (const r of existing.data) {
          existingResponses.set(r.question_id as string, r.response_value);
        }
      }
      if (result.data) {
        assessmentResult = result.data as { computed_score: ComputedScore };
      }
    }
  }

  const isComplete = progress.status === 'completed';

  // Server actions bound to this step
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
    return submitAssessment(
      id,
      assessmentDefinition.id,
      step.assessment_kind,
      formData,
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/journey"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          My journey
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {step.title}
          </h1>
          <Badge tone={STATUS_TONE[progress.status]}>
            {STATUS_LABEL[progress.status]}
          </Badge>
        </div>
        {step.description && (
          <p className="mt-2 text-sm text-foreground-muted">{step.description}</p>
        )}
      </div>

      {/* Step-type-specific UI */}
      {step.step_type === 'schedule' && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          {step.appointment_type ? (
            <p className="text-sm text-foreground-muted">
              You&apos;ll be booking a{' '}
              <span className="font-medium text-foreground">{step.appointment_type.name}</span>
              {step.appointment_type.duration_minutes
                ? ` (${step.appointment_type.duration_minutes} min)`
                : ''}.
            </p>
          ) : (
            <p className="text-sm text-foreground-muted">
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
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={
                  step.appointment_type_id
                    ? `/scheduling/new-booking?type=${step.appointment_type_id}&progress=${progress.id}`
                    : '/scheduling/new-booking'
                }
              >
                <Button>
                  <CalendarDays className="h-4 w-4" />
                  Book your appointment
                </Button>
              </Link>
              <span className="text-xs text-foreground-subtle">
                Opens scheduling. Come back here when you&apos;re done.
              </span>
            </div>
          )}

          {!isComplete && (
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <CompleteStepButton
                action={completeAction}
                label="I've completed this"
              />
              <span className="text-xs text-foreground-subtle">
                Use this if you&apos;ve already met outside of the booking.
              </span>
            </div>
          )}
        </div>
      )}

      {step.step_type === 'video' && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          {videoLessons.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              No videos have been added to this step yet. Reach out to your campus team.
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {videoLessons.map((l) => {
                  const embed = toYouTubeEmbed(l.video_url);
                  return (
                    <li
                      key={l.id}
                      className="overflow-hidden rounded-md border border-border"
                    >
                      {embed ? (
                        <div className="aspect-video w-full bg-black">
                          <iframe
                            src={embed}
                            className="h-full w-full"
                            title={l.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : l.video_url ? (
                        <a
                          href={l.video_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-3 bg-surface-muted/40 p-3 hover:bg-surface-muted"
                        >
                          <Video className="h-5 w-5 flex-none text-primary" />
                          <span className="flex-1 text-sm font-medium text-foreground">
                            {l.title}
                          </span>
                          <ExternalLink className="h-4 w-4 text-foreground-subtle" />
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 bg-surface-muted/40 p-3">
                          <Video className="h-5 w-5 flex-none text-foreground-subtle" />
                          <span className="flex-1 text-sm text-foreground">{l.title}</span>
                        </div>
                      )}
                      <div className="px-3 py-2">
                        <p className="text-sm font-medium text-foreground">{l.title}</p>
                        {l.body && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground-muted">
                            {l.body}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!isComplete && (
                <div className="border-t border-border pt-3">
                  <CompleteStepButton
                    action={completeAction}
                    label="I&apos;ve watched these"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step.step_type === 'event' && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-foreground-muted">
            Attend the event, then mark it complete here.
          </p>
          {!isComplete && (
            <CompleteStepButton action={attendAction} label="Mark attended" />
          )}
        </div>
      )}

      {(step.step_type === 'manual' || step.step_type === 'conversation') && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-foreground-muted">
            {step.step_type === 'conversation'
              ? "Your connector will reach out for a conversation. Once you've had it, mark this step complete."
              : 'Take care of this step at your own pace, then mark it complete.'}
          </p>
          {!isComplete && (
            <CompleteStepButton action={completeAction} label="Mark complete" />
          )}
        </div>
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
            <AssessmentResults
              computed={assessmentResult.computed_score}
              categories={assessmentCategories}
            />
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

      {isComplete && (
        <div className="rounded-md border border-success/40 bg-success-bg/50 p-3 text-sm text-foreground-muted">
          You&apos;ve completed this step.
        </div>
      )}
    </div>
  );
}
