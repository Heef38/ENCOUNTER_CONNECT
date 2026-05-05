import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Check,
  ArrowDown,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  MapPin,
  Sparkles,
  Video,
  Zap,
  Lock,
} from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FlowStepType } from '@/lib/flows/types';

interface JourneyStep {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_at: string | null;
  flow_step: {
    id: string;
    title: string;
    description: string | null;
    step_type: FlowStepType;
    order_index: number;
    phase_index: number;
    is_required: boolean;
  } | null;
}

interface JourneyParticipant {
  id: string;
  first_name: string;
  status: string;
  campus: {
    id: string;
    name: string;
    hero_image_url: string | null;
    intro_text: string | null;
    body: string | null;
    brand_color: string | null;
  } | null;
  connector: {
    profile: { first_name: string; last_name: string; email: string | null } | null;
  } | null;
  progress: JourneyStep[] | null;
}

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

export default async function JourneyPage() {
  const session = await requireAuth();

  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  if (isPlatform || (role && role !== 'participant')) {
    redirect('/dashboard');
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('participants')
    .select(
      `id, first_name, status,
       campus:campuses(id, name, hero_image_url, intro_text, body, brand_color),
       connector:connectors!participants_assigned_connector_id_fkey(
         profile:profiles!connectors_profile_id_fkey(first_name, last_name, email)
       ),
       progress:participant_progress(
         id, status, completed_at,
         flow_step:flow_steps(id, title, description, step_type, order_index, phase_index, is_required)
       )`,
    )
    .eq('profile_id', session.id)
    .maybeSingle();

  const participant = data as unknown as JourneyParticipant | null;

  if (!participant) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <h1 className="font-display text-3xl font-semibold text-foreground">Welcome</h1>
        <p className="mt-3 text-sm text-foreground-muted">
          Your account isn&apos;t linked to a participant record yet. Reach out to
          your campus team so they can get you started.
        </p>
      </div>
    );
  }

  // Order purely by order_index (the editor's drag order). Phase grouping is
  // a visual run of consecutive same-phase steps below — sorting by phase
  // first would scramble whatever order the admin set in the editor.
  const progress = (participant.progress ?? [])
    .slice()
    .sort(
      (a, b) =>
        (a.flow_step?.order_index ?? 0) - (b.flow_step?.order_index ?? 0),
    );

  // Group by phase_index. State per group:
  //  - 'done':    every required step in the phase is completed
  //  - 'current': any step in the phase is in_progress (or pending in a phase
  //               that no later phase has started yet)
  //  - 'locked':  no step in the phase has progress yet
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
      requiredSteps.length > 0 &&
      requiredSteps.every((s) => s.status === 'completed');
    const anyOpen = group.steps.some(
      (s) => s.status === 'in_progress' || s.status === 'pending',
    );
    if (allRequiredDone && !anyOpen) {
      group.state = 'done';
    } else if (group.steps.some((s) => s.status === 'in_progress')) {
      group.state = 'current';
    } else if (
      group.steps.every((s) => s.status === 'pending')
      && phaseGroups.every(
        (g) => g.phaseIndex >= group.phaseIndex || g.state === 'done',
      )
    ) {
      // No earlier phase is unfinished, so this is the active phase even
      // though no row has been promoted to in_progress yet.
      group.state = 'current';
    } else {
      group.state = 'locked';
    }
  }

  const total = progress.length;
  const doneCount = progress.filter((p) => p.status === 'completed').length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = phaseGroups.every((g) => g.state === 'done');

  const connector = participant.connector?.profile;
  const campus = participant.campus;
  const accent = campus?.brand_color ?? null;

  return (
    <div
      className="mx-auto max-w-2xl space-y-6"
      style={accent ? ({ ['--campus-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Hi, {participant.first_name}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground-muted">
          {campus?.name && <span>{campus.name}</span>}
          <Badge tone="primary">{participant.status.replace('_', ' ')}</Badge>
        </p>
      </div>

      {total > 0 && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Your progress
            </span>
            <span className="text-xs text-foreground-subtle">
              {doneCount} of {total} · {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Function-block journey: signup entry, then each phase as a group */}
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
                        : group.state === 'current' &&
                          (p.status === 'in_progress' || p.status === 'pending')
                        ? 'current'
                        : group.state === 'done'
                        ? 'done'
                        : 'locked';
                    return (
                      <JourneyStepBlock
                        key={p.id}
                        progress={p}
                        state={stepState}
                      />
                    );
                  })}
                </div>
              </div>
              {gIdx < phaseGroups.length - 1 && <ConnectorLine />}
            </div>
          );
        })}
      </div>

      {allDone && total > 0 && (
        <div className="rounded-md border border-success/40 bg-success-bg/50 p-3 text-sm text-foreground-muted">
          You&apos;ve completed every step. 🎉 Your campus team will reach out about
          what&apos;s next.
        </div>
      )}

      {total === 0 && (
        <div className="rounded-md border border-dashed border-border-strong p-6 text-center text-sm text-foreground-muted">
          No steps assigned yet. Your campus will add them soon.
        </div>
      )}

      {connector && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Your connector
          </p>
          <p className="mt-1 font-medium text-foreground">
            {connector.first_name} {connector.last_name}
          </p>
          {connector.email && (
            <a
              href={`mailto:${connector.email}`}
              className="text-sm text-primary hover:underline"
            >
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
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            Signed up
          </p>
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
        <div
          className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${iconBg}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {state === 'current' && (
              <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
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
        {state === 'current' && (
          <Button size="sm">Continue</Button>
        )}
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
