import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Check,
  ArrowDown,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  MapPin,
  Sparkles,
  Video,
  Zap,
  Lock,
  FileText,
} from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { loadParticipantJourney, type JourneyStep } from '@/lib/journey/queries';
import type { FlowStepType } from '@/lib/flows/types';

const STEP_ICON: Record<FlowStepType, React.ReactNode> = {
  manual:       <Sparkles className="h-4 w-4" />,
  video:        <Video className="h-4 w-4" />,
  schedule:     <CalendarDays className="h-4 w-4" />,
  event:        <MapPin className="h-4 w-4" />,
  conversation: <MessageSquare className="h-4 w-4" />,
  assessment:   <ClipboardList className="h-4 w-4" />,
};

const STEP_LABEL: Record<FlowStepType, string> = {
  manual:       'Mark complete',
  video:        'Watch videos',
  schedule:     'Schedule meeting',
  event:        'Attend event',
  conversation: 'Conversation',
  assessment:   'Assessment',
};

export default async function JourneyMapPage() {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const participant = await loadParticipantJourney(supabase, session.id);

  if (!participant) redirect('/journey');

  // Order purely by order_index (the editor's drag order); phase grouping is a
  // visual run of consecutive same-phase steps below.
  const progress = (participant.progress ?? [])
    .slice()
    .filter((s) => s.flow_step !== null)
    .sort((a, b) => (a.flow_step?.order_index ?? 0) - (b.flow_step?.order_index ?? 0));

  type PhaseGroup = {
    phaseIndex: number;
    steps: JourneyStep[];
    state: 'done' | 'current' | 'locked';
  };
  const phaseGroups: PhaseGroup[] = [];
  for (const p of progress) {
    const phaseIndex = p.flow_step?.phase_index ?? 0;
    const last = phaseGroups[phaseGroups.length - 1];
    if (last && last.phaseIndex === phaseIndex) last.steps.push(p);
    else phaseGroups.push({ phaseIndex, steps: [p], state: 'locked' });
  }

  for (const group of phaseGroups) {
    const requiredSteps = group.steps.filter((s) => s.flow_step?.is_required);
    const allRequiredDone =
      requiredSteps.length > 0 && requiredSteps.every((s) => s.status === 'completed');
    const anyOpen = group.steps.some((s) => s.status === 'in_progress' || s.status === 'pending');
    if (allRequiredDone && !anyOpen) {
      group.state = 'done';
    } else if (group.steps.some((s) => s.status === 'in_progress')) {
      group.state = 'current';
    } else if (
      group.steps.every((s) => s.status === 'pending') &&
      phaseGroups.every((g) => g.phaseIndex >= group.phaseIndex || g.state === 'done')
    ) {
      group.state = 'current';
    } else {
      group.state = 'locked';
    }
  }

  const total = progress.length;
  const doneCount = progress.filter((p) => p.status === 'completed').length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  const connector = participant.connector?.profile;
  const campus = participant.campus;

  return (
    <div className="space-y-6 px-4 py-5">
      <div>
        <Link
          href="/journey"
          className="mb-2 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to current step
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Your journey
          </h1>
          <Link
            href="/journey/documents"
            className="inline-flex flex-none items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground-muted transition hover:border-primary/60 hover:text-foreground"
          >
            <FileText className="h-4 w-4" />
            Documents
          </Link>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
          {campus?.name && <span>{campus.name}</span>}
          <Badge tone="primary">{participant.status.replace('_', ' ')}</Badge>
        </p>
      </div>

      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Progress
            </span>
            <span className="text-xs text-foreground-subtle">
              {doneCount} of {total} · {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="space-y-1">
        <SignupBlock participantName={participant.first_name} campusName={campus?.name ?? null} />
        <ConnectorLine />

        {phaseGroups.map((group, gIdx) => {
          const isParallel = group.steps.length > 1;
          const groupClass =
            isParallel && group.state === 'current'
              ? 'rounded-lg border-2 border-dashed border-info/40 bg-info-bg/20 p-2'
              : isParallel
              ? 'rounded-lg border border-dashed border-border p-2'
              : '';
          return (
            <div key={`phase-${group.phaseIndex}`}>
              <div className={groupClass}>
                {isParallel && (
                  <p className="mb-2 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-subtle">
                    Phase {gIdx + 1} — finish all to advance
                  </p>
                )}
                <div className="space-y-1">
                  {group.steps.map((p) => {
                    if (!p.flow_step) return null;
                    const stepState =
                      p.status === 'completed'
                        ? 'done'
                        : group.state === 'current' && (p.status === 'in_progress' || p.status === 'pending')
                        ? 'current'
                        : group.state === 'done'
                        ? 'done'
                        : 'locked';
                    return <JourneyStepBlock key={p.id} progress={p} state={stepState} />;
                  })}
                </div>
              </div>
              {gIdx < phaseGroups.length - 1 && <ConnectorLine />}
            </div>
          );
        })}
      </div>

      {connector && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Your connector
          </p>
          <p className="mt-1 font-medium text-foreground">
            {connector.first_name} {connector.last_name}
          </p>
          {connector.email && (
            <a href={`mailto:${connector.email}`} className="text-sm text-primary hover:underline">
              {connector.email}
            </a>
          )}
        </section>
      )}
    </div>
  );
}

// ── Sub-blocks ───────────────────────────────────────────────────

function SignupBlock({
  participantName,
  campusName,
}: {
  participantName: string;
  campusName: string | null;
}) {
  return (
    <div className="rounded-lg border-2 border-success/30 bg-success-bg/20 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Signed up</p>
          <p className="text-sm text-foreground">
            Welcome, {participantName}.
            {campusName && <> You&apos;re part of <span className="font-medium">{campusName}</span>.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectorLine() {
  return (
    <div className="flex justify-center py-0.5">
      <div className="flex flex-col items-center text-foreground-subtle">
        <div className="h-3 w-px bg-border-strong" />
        <ArrowDown className="h-3 w-3" />
      </div>
    </div>
  );
}

function JourneyStepBlock({
  progress,
  state,
}: {
  progress: JourneyStep;
  state: 'done' | 'current' | 'locked';
}) {
  const step = progress.flow_step!;
  const containerClass =
    state === 'current'
      ? 'border-2 border-primary bg-primary/5 shadow-md'
      : state === 'done'
      ? 'border border-border bg-surface-muted/50'
      : 'border border-border bg-surface opacity-60';

  const iconBg =
    state === 'current'
      ? 'bg-primary text-white'
      : state === 'done'
      ? 'bg-success text-white'
      : 'bg-surface-muted text-foreground-subtle';

  const icon =
    state === 'done' ? (
      <Check className="h-4 w-4" />
    ) : state === 'locked' ? (
      <Lock className="h-3.5 w-3.5" />
    ) : (
      STEP_ICON[step.step_type]
    );

  const inner = (
    <div className={`rounded-lg p-3 transition ${containerClass}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${iconBg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {state === 'current' && (
              <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                <Zap className="h-2.5 w-2.5" />
                Up next
              </span>
            )}
            <p
              className={`text-sm ${
                state === 'done'
                  ? 'text-foreground-muted line-through decoration-foreground-subtle'
                  : 'font-medium text-foreground'
              }`}
            >
              {step.title}
            </p>
          </div>
          {state === 'current' && step.description && (
            <p className="mt-1 text-xs text-foreground-muted">{step.description}</p>
          )}
          {state === 'current' && (
            <p className="mt-1 text-xs text-foreground-subtle">{STEP_LABEL[step.step_type]}</p>
          )}
        </div>
      </div>
    </div>
  );

  if (state === 'locked') return inner;
  return (
    <Link href={`/journey/steps/${progress.id}`} className="block">
      {inner}
    </Link>
  );
}
