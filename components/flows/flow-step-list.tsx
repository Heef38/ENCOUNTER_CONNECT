'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ClipboardList,
  MessageSquare,
  MapPin,
  Sparkles,
  Video,
  Zap,
  ArrowDown,
  Pencil,
} from 'lucide-react';
import type {
  FlowStep,
  FlowStepType,
  FlowTriggerKind,
  FlowOutputKind,
  AssessmentKindValue,
} from '@/lib/flows/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const STEP_TYPES: { value: FlowStepType; label: string; description: string }[] = [
  { value: 'manual',       label: 'Manual check-off',  description: 'Connector or participant marks complete' },
  { value: 'video',        label: 'Watch videos',      description: 'Participant watches one or more lessons' },
  { value: 'assessment',   label: 'Assessment',        description: 'Participant completes a questionnaire' },
  { value: 'schedule',     label: 'Schedule meeting',  description: 'Participant books a time with a connector' },
  { value: 'event',        label: 'Attend event',      description: 'Participant attends an event in person' },
  { value: 'conversation', label: 'Conversation',      description: 'Connector has a 1:1 conversation' },
];

const TRIGGER_KINDS: { value: FlowTriggerKind; label: string }[] = [
  { value: 'previous_complete', label: 'When the previous step is completed' },
  { value: 'signup',            label: 'When the participant signs up' },
  { value: 'event_attended',    label: 'When a tracked event is attended' },
  { value: 'time_delay',        label: 'After a time delay' },
];

const OUTPUT_KINDS: { value: FlowOutputKind; label: string }[] = [
  { value: 'advance',              label: 'Advance to the next step' },
  { value: 'notify_connector',     label: 'Notify the assigned connector' },
  { value: 'auto_match_connector', label: 'Auto-match the best-fit connector' },
];

const ASSESSMENT_KINDS: { value: AssessmentKindValue; label: string }[] = [
  { value: 'personal',         label: 'Personal Assessment' },
  { value: 'connect_with_god', label: 'Connect with God' },
  { value: 'spiritual_gifts',  label: 'Spiritual Gifts' },
];

const STEP_ICON: Record<FlowStepType, React.ReactNode> = {
  manual:       <Sparkles className="h-4 w-4" />,
  video:        <Video className="h-4 w-4" />,
  schedule:     <CalendarDays className="h-4 w-4" />,
  event:        <MapPin className="h-4 w-4" />,
  conversation: <MessageSquare className="h-4 w-4" />,
  assessment:   <ClipboardList className="h-4 w-4" />,
};

interface AppointmentType {
  id: string;
  name: string;
  duration_minutes: number;
}

interface LessonOption {
  id: string;
  title: string;
  video_url: string | null;
}

interface Props {
  flowId: string;
  initialSteps: FlowStep[];
  appointmentTypes: AppointmentType[];
  lessons: LessonOption[];
}

interface StepFormState {
  title: string;
  description: string;
  step_type: FlowStepType;
  appointment_type_id: string;
  assessment_kind: AssessmentKindValue | '';
  trigger_kind: FlowTriggerKind;
  output_kind: FlowOutputKind;
  is_required: boolean;
  lesson_ids: string[];
}

const defaultForm = (firstStep: boolean): StepFormState => ({
  title: '',
  description: '',
  step_type: 'manual',
  appointment_type_id: '',
  assessment_kind: '',
  trigger_kind: firstStep ? 'signup' : 'previous_complete',
  output_kind: 'advance',
  is_required: true,
  lesson_ids: [],
});

export default function FlowStepList({
  flowId,
  initialSteps,
  appointmentTypes,
  lessons,
}: Props) {
  const [steps, setSteps] = useState<FlowStep[]>(initialSteps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [form, setForm] = useState<StepFormState>(defaultForm(false));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apiPatch(body: Record<string, unknown>) {
    const res = await fetch(`/api/flows/${flowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Request failed');
    return json;
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const newStep = await apiPatch({
        action: 'add_step',
        step: {
          title: form.title,
          description: form.description || undefined,
          step_type: form.step_type,
          order_index: steps.length,
          appointment_type_id: form.appointment_type_id || undefined,
          assessment_kind:
            form.step_type === 'assessment' && form.assessment_kind
              ? form.assessment_kind
              : null,
          trigger_kind: form.trigger_kind,
          output_kind: form.output_kind,
          is_required: form.is_required,
          lesson_ids: form.step_type === 'video' ? form.lesson_ids : [],
        },
      });
      const fresh = newStep as FlowStep;
      // The POST doesn't echo back the linked lessons; hydrate locally.
      fresh.lessons = lessons.filter((l) => form.lesson_ids.includes(l.id))
        .map((l, i) => ({
          id: l.id, title: l.title, slug: null, video_url: l.video_url,
          body: null, order_index: i,
        }));
      setSteps((prev) => [...prev, fresh]);
      setAddingNew(false);
      setForm(defaultForm(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add step');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStep(stepId: string, e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPatch({
        action: 'update_step',
        step_id: stepId,
        step: {
          title: form.title,
          description: form.description || undefined,
          step_type: form.step_type,
          appointment_type_id: form.appointment_type_id || null,
          assessment_kind:
            form.step_type === 'assessment' && form.assessment_kind
              ? form.assessment_kind
              : null,
          trigger_kind: form.trigger_kind,
          output_kind: form.output_kind,
          is_required: form.is_required,
          lesson_ids: form.step_type === 'video' ? form.lesson_ids : [],
        },
      });
      const fresh = updated as FlowStep;
      fresh.lessons = lessons.filter((l) => form.lesson_ids.includes(l.id))
        .map((l, i) => ({
          id: l.id, title: l.title, slug: null, video_url: l.video_url,
          body: null, order_index: i,
        }));
      setSteps((prev) => prev.map((s) => (s.id === stepId ? fresh : s)));
      setEditingId(null);
      setForm(defaultForm(false));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update step');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm('Remove this step?')) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch({ action: 'delete_step', step_id: stepId });
      setSteps((prev) =>
        prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, order_index: i })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete step');
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= steps.length) return;
    const next = [...steps];
    [next[index], next[swap]] = [next[swap], next[index]];
    const reindexed = next.map((s, i) => ({ ...s, order_index: i }));
    setSteps(reindexed);
    try {
      await apiPatch({
        action: 'reorder_steps',
        step_ids: reindexed.map((s) => s.id),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder');
      setSteps(steps);
    }
  }

  /**
   * Merge a step into the previous step's phase so they run concurrently.
   */
  async function handleMergeIntoPrevPhase(stepId: string) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx <= 0) return;
    const prevPhase = steps[idx - 1].phase_index;
    setSaving(true);
    setError(null);
    try {
      await apiPatch({
        action: 'update_step',
        step_id: stepId,
        step: { phase_index: prevPhase },
      });
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, phase_index: prevPhase } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge phase');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Move a step out of a multi-step phase into its own phase. Uses
   * (max phase_index in flow) + 1 to guarantee uniqueness.
   */
  async function handleSplitToOwnPhase(stepId: string) {
    const maxPhase = steps.reduce((m, s) => Math.max(m, s.phase_index), 0);
    const newPhase = maxPhase + 1;
    setSaving(true);
    setError(null);
    try {
      await apiPatch({
        action: 'update_step',
        step_id: stepId,
        step: { phase_index: newPhase },
      });
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, phase_index: newPhase } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to split phase');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(step: FlowStep) {
    setEditingId(step.id);
    setAddingNew(false);
    setForm({
      title: step.title,
      description: step.description ?? '',
      step_type: step.step_type,
      appointment_type_id: step.appointment_type_id ?? '',
      assessment_kind: step.assessment_kind ?? '',
      trigger_kind: step.trigger_kind,
      output_kind: step.output_kind,
      is_required: step.is_required,
      lesson_ids: step.lessons?.map((l) => l.id) ?? [],
    });
  }

  function startAdd() {
    setAddingNew(true);
    setEditingId(null);
    setForm(defaultForm(steps.length === 0));
  }

  // Sort by order_index only. Phase membership is encoded in phase_index but
  // grouping is visual: a phase is a run of consecutive steps that share the
  // same phase_index. Sorting by phase_index first would override the user's
  // up/down moves whenever the swapped steps live in different phases.
  const sortedSteps = [...steps].sort((a, b) => a.order_index - b.order_index);
  const phases: { phaseIndex: number; steps: FlowStep[] }[] = [];
  for (const s of sortedSteps) {
    const last = phases[phases.length - 1];
    if (last && last.phaseIndex === s.phase_index) {
      last.steps.push(s);
    } else {
      phases.push({ phaseIndex: s.phase_index, steps: [s] });
    }
  }

  return (
    <div className="space-y-2">
      {/* Fixed signup entry block — describes how participants enter the flow */}
      <SignupEntryBlock />
      <Connector />

      {phases.map((phase, phaseIdx) => {
        const isParallel = phase.steps.length > 1;
        return (
          <div key={`phase-${phase.phaseIndex}`}>
            <div
              className={
                isParallel
                  ? 'rounded-lg border-2 border-dashed border-info/40 bg-info-bg/20 p-2'
                  : ''
              }
            >
              {isParallel && (
                <div className="mb-2 flex items-center gap-2 px-2 pt-1">
                  <span className="rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                    Phase {phaseIdx + 1}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    All steps below run in parallel — every required step must
                    finish before the next phase starts.
                  </span>
                </div>
              )}
              <div className="space-y-2">
                {phase.steps.map((step) => {
                  const flatIndex = sortedSteps.findIndex((s) => s.id === step.id);
                  const prevStep = flatIndex > 0 ? sortedSteps[flatIndex - 1] : null;
                  const canMergeIntoPrevPhase =
                    prevStep !== null && prevStep.phase_index !== step.phase_index;
                  const canSplit = isParallel;

                  return (
                    <div key={step.id}>
                      {editingId === step.id ? (
                        <StepFormBlock
                          form={form}
                          setForm={setForm}
                          appointmentTypes={appointmentTypes}
                          lessons={lessons}
                          error={error}
                          saving={saving}
                          submitLabel="Save step"
                          onSubmit={(e) => handleUpdateStep(step.id, e)}
                          onCancel={() => {
                            setEditingId(null);
                            setForm(defaultForm(false));
                            setError(null);
                          }}
                        />
                      ) : (
                        <StepBlock
                          step={step}
                          index={flatIndex}
                          isLast={flatIndex === sortedSteps.length - 1}
                          canMoveUp={flatIndex > 0}
                          canMoveDown={flatIndex < sortedSteps.length - 1}
                          canMergeIntoPrevPhase={canMergeIntoPrevPhase}
                          canSplit={canSplit}
                          saving={saving}
                          onEdit={() => startEdit(step)}
                          onDelete={() => handleDeleteStep(step.id)}
                          onMoveUp={() => handleMove(flatIndex, 'up')}
                          onMoveDown={() => handleMove(flatIndex, 'down')}
                          onMergeIntoPrevPhase={() =>
                            handleMergeIntoPrevPhase(step.id)
                          }
                          onSplit={() => handleSplitToOwnPhase(step.id)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {phaseIdx < phases.length - 1 && <Connector />}
          </div>
        );
      })}

      {addingNew && (
        <>
          {steps.length > 0 && <Connector />}
          <StepFormBlock
            form={form}
            setForm={setForm}
            appointmentTypes={appointmentTypes}
            lessons={lessons}
            error={error}
            saving={saving}
            submitLabel="Add step"
            onSubmit={handleAddStep}
            onCancel={() => { setAddingNew(false); setForm(defaultForm(false)); setError(null); }}
          />
        </>
      )}

      {!addingNew && !editingId && (
        <div className="flex justify-center pt-1">
          <Button size="sm" variant="outline" onClick={startAdd}>
            + Add step
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-blocks ───────────────────────────────────────────────────

function SignupEntryBlock() {
  return (
    <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Flow entry
          </p>
          <p className="mt-0.5 text-sm font-medium text-foreground">
            Participant signs up & is assigned to a campus
          </p>
          <p className="mt-1 text-xs text-foreground-muted">
            Triggered when someone completes the form at <code>/c/[church]/[campus]</code>.
            Their <code>campus_id</code> is set automatically and the flow begins at step 1.
          </p>
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center text-foreground-subtle">
        <div className="h-3 w-px bg-border-strong" />
        <ArrowDown className="h-3 w-3" />
      </div>
    </div>
  );
}

function StepBlock({
  step,
  index,
  isLast,
  canMoveUp,
  canMoveDown,
  canMergeIntoPrevPhase,
  canSplit,
  saving,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onMergeIntoPrevPhase,
  onSplit,
}: {
  step: FlowStep;
  index: number;
  isLast: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMergeIntoPrevPhase: boolean;
  canSplit: boolean;
  saving: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMergeIntoPrevPhase: () => void;
  onSplit: () => void;
}) {
  const triggerLabel = TRIGGER_KINDS.find((t) => t.value === step.trigger_kind)?.label ?? step.trigger_kind;
  const stepTypeLabel = STEP_TYPES.find((t) => t.value === step.step_type)?.label ?? step.step_type;
  const outputLabel =
    step.step_type === 'schedule'
      ? step.output_kind === 'auto_match_connector'
        ? 'Auto-match the best-fit connector (3 best times)'
        : 'Participant picks any open time (manual)'
      : OUTPUT_KINDS.find((o) => o.value === step.output_kind)?.label ?? step.output_kind;

  return (
    <div className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-foreground">{step.title}</span>
          {!step.is_required && (
            <span className="text-xs text-foreground-subtle">optional</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp || saving}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
            aria-label="Move up"
          >↑</button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown || saving}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
            aria-label="Move down"
          >↓</button>
          <button
            onClick={onEdit}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground"
            aria-label="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={saving}
            className="rounded px-2 py-0.5 text-xs text-foreground-subtle hover:bg-danger-bg hover:text-danger disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>

      {(canMergeIntoPrevPhase || canSplit) && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-muted/30 px-4 py-1.5 text-xs">
          {canMergeIntoPrevPhase && (
            <button
              type="button"
              onClick={onMergeIntoPrevPhase}
              disabled={saving}
              className="rounded px-2 py-0.5 text-foreground-muted hover:bg-info-bg/40 hover:text-info disabled:opacity-50"
            >
              ⇡ Run in parallel with previous step
            </button>
          )}
          {canSplit && (
            <button
              type="button"
              onClick={onSplit}
              disabled={saving}
              className="rounded px-2 py-0.5 text-foreground-muted hover:bg-warning-bg/40 hover:text-warning disabled:opacity-50"
            >
              ↓ Move to its own phase
            </button>
          )}
        </div>
      )}

      {step.description && (
        <p className="border-b border-border px-4 py-2 text-xs text-foreground-muted">
          {step.description}
        </p>
      )}

      {/* TRIGGER row */}
      <Row label="Trigger" tone="trigger">
        <span className="text-foreground">{triggerLabel}</span>
      </Row>

      {/* ACTION row */}
      <Row label="Action" tone="action">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className="text-foreground-subtle">{STEP_ICON[step.step_type]}</span>
          {stepTypeLabel}
        </span>
        {step.step_type === 'video' && step.lessons && step.lessons.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-foreground-muted">
            {step.lessons.map((l) => (
              <li key={l.id} className="flex items-center gap-1.5">
                <Video className="h-3 w-3 text-foreground-subtle" />
                {l.title}
              </li>
            ))}
          </ul>
        )}
        {step.step_type === 'assessment' && step.assessment_kind && (
          <p className="mt-1 text-xs text-foreground-muted">
            {ASSESSMENT_KINDS.find((k) => k.value === step.assessment_kind)?.label}
          </p>
        )}
      </Row>

      {/* OUTPUT row */}
      <Row label="Output" tone="output" last={isLast}>
        <span className="text-foreground">{outputLabel}</span>
      </Row>
    </div>
  );
}

function Row({
  label,
  tone,
  children,
  last,
}: {
  label: string;
  tone: 'trigger' | 'action' | 'output';
  children: React.ReactNode;
  last?: boolean;
}) {
  const toneClass = {
    trigger: 'bg-info-bg/40 text-info',
    action:  'bg-surface-muted text-foreground-muted',
    output:  'bg-success-bg/40 text-success',
  }[tone];

  return (
    <div className={`flex gap-3 px-4 py-2.5 text-sm ${last ? '' : 'border-b border-border'}`}>
      <span className={`inline-flex h-5 flex-none items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── Edit form (full block replacement during edit) ────────────────

function StepFormBlock({
  form,
  setForm,
  appointmentTypes,
  lessons,
  error,
  saving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  form: StepFormState;
  setForm: React.Dispatch<React.SetStateAction<StepFormState>>;
  appointmentTypes: AppointmentType[];
  lessons: LessonOption[];
  error: string | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  function toggleLesson(lessonId: string) {
    setForm((f) => ({
      ...f,
      lesson_ids: f.lesson_ids.includes(lessonId)
        ? f.lesson_ids.filter((id) => id !== lessonId)
        : [...f.lesson_ids, lessonId],
    }));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border-2 border-primary bg-primary/5 p-4 shadow-sm"
    >
      <div>
        <Label htmlFor="step_title">
          Step title <span className="text-danger">*</span>
        </Label>
        <Input
          id="step_title"
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Watch the welcome videos"
        />
      </div>

      <div>
        <Label htmlFor="step_description">Description</Label>
        <Input
          id="step_description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional guidance"
        />
      </div>

      {/* TRIGGER */}
      <div>
        <Label htmlFor="trigger_kind" className="text-info">Trigger</Label>
        <select
          id="trigger_kind"
          value={form.trigger_kind}
          onChange={(e) => setForm((f) => ({ ...f, trigger_kind: e.target.value as FlowTriggerKind }))}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {TRIGGER_KINDS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* ACTION */}
      <div>
        <Label htmlFor="step_type">Action</Label>
        <select
          id="step_type"
          value={form.step_type}
          onChange={(e) => setForm((f) => ({ ...f, step_type: e.target.value as FlowStepType }))}
          className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {STEP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-foreground-muted">
          {STEP_TYPES.find((t) => t.value === form.step_type)?.description}
        </p>
      </div>

      {form.step_type === 'video' && (
        <div>
          <Label>Lessons</Label>
          {lessons.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              No lessons in this church yet. Create them at{' '}
              <Link href="/settings/lessons" className="text-primary hover:underline">
                Settings → Lessons
              </Link>.
            </p>
          ) : (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-surface p-2">
              {lessons.map((l) => {
                const checked = form.lesson_ids.includes(l.id);
                return (
                  <label
                    key={l.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLesson(l.id)}
                      className="h-3.5 w-3.5 rounded border-border accent-primary"
                    />
                    <span className="flex-1">{l.title}</span>
                    {l.video_url ? (
                      <Video className="h-3 w-3 text-foreground-subtle" />
                    ) : (
                      <span className="text-xs text-foreground-subtle">no video</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(form.step_type === 'schedule' || form.step_type === 'event') && (
        <div>
          <Label htmlFor="appointment_type">Appointment type</Label>
          <select
            id="appointment_type"
            value={form.appointment_type_id}
            onChange={(e) => setForm((f) => ({ ...f, appointment_type_id: e.target.value }))}
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— None —</option>
            {appointmentTypes.map((at) => (
              <option key={at.id} value={at.id}>
                {at.name} ({at.duration_minutes}m)
              </option>
            ))}
          </select>
        </div>
      )}

      {form.step_type === 'assessment' && (
        <div>
          <Label htmlFor="assessment_kind">Assessment</Label>
          <select
            id="assessment_kind"
            value={form.assessment_kind}
            onChange={(e) =>
              setForm((f) => ({ ...f, assessment_kind: e.target.value as AssessmentKindValue | '' }))
            }
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">— Pick one —</option>
            {ASSESSMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* OUTPUT — for schedule steps, present this as a "Booking mode" picker
          since the generic output_kind enum is misleading there. */}
      {form.step_type === 'schedule' ? (
        <div>
          <Label htmlFor="output_kind" className="text-success">Booking mode</Label>
          <select
            id="output_kind"
            value={
              form.output_kind === 'auto_match_connector'
                ? 'auto_match_connector'
                : 'advance'
            }
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                output_kind: e.target.value as FlowOutputKind,
              }))
            }
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="auto_match_connector">
              Auto-match best-fit connector (3 best times)
            </option>
            <option value="advance">
              Choose any open time (manual)
            </option>
          </select>
          <p className="mt-1 text-xs text-foreground-muted">
            {form.output_kind === 'auto_match_connector'
              ? 'Participant picks from 3 proposed times; the system assigns whichever connector is free at their pick.'
              : 'Participant browses all available times in the scheduling app. No connector is auto-assigned — campus team handles it.'}
          </p>
        </div>
      ) : (
        <div>
          <Label htmlFor="output_kind" className="text-success">Output</Label>
          <select
            id="output_kind"
            value={form.output_kind}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                output_kind: e.target.value as FlowOutputKind,
              }))
            }
            className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            {OUTPUT_KINDS.filter((o) => o.value !== 'auto_match_connector').map(
              (o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ),
            )}
          </select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id="is_required"
          type="checkbox"
          checked={form.is_required}
          onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
          className="h-3.5 w-3.5 rounded border-border accent-primary"
        />
        <label htmlFor="is_required" className="text-xs text-foreground-muted">Required step</label>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
