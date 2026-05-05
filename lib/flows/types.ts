import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Enums ─────────────────────────────────────────────────────

export type FlowStepType =
  | 'manual'
  | 'schedule'
  | 'event'
  | 'conversation'
  | 'assessment'
  | 'video';

export type FlowTriggerKind =
  | 'signup'
  | 'previous_complete'
  | 'event_attended'
  | 'time_delay';

export type FlowOutputKind =
  | 'advance'
  | 'notify_connector'
  | 'auto_match_connector';

// ── Flow ──────────────────────────────────────────────────────

export interface Flow {
  id: string;
  church_id: string;
  name: string;
  description: string | null;
  campus_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FlowWithSteps extends Flow {
  steps: FlowStep[];
  campus?: { id: string; name: string } | null;
}

export interface FlowWithStats extends Flow {
  step_count: number;
  campus: { id: string; name: string } | null;
}

// ── Flow Step ─────────────────────────────────────────────────

export interface FlowStepLesson {
  id: string;
  title: string;
  slug: string | null;
  video_url: string | null;
  body: string | null;
  order_index: number;
}

export interface FlowStep {
  id: string;
  flow_id: string;
  title: string;
  description: string | null;
  step_type: FlowStepType;
  order_index: number;
  /**
   * Steps in the same flow that share a phase_index are concurrent. The
   * flow advances to the next phase only after every required step in
   * the current phase is completed.
   */
  phase_index: number;
  appointment_type_id: string | null;
  assessment_kind:
    | 'personal'
    | 'connect_with_god'
    | 'spiritual_gifts'
    | null;
  trigger_kind: FlowTriggerKind;
  output_kind: FlowOutputKind;
  is_required: boolean;
  created_at: string;
  updated_at: string;
  /** Populated for step_type='video' via flow_step_lessons join. */
  lessons?: FlowStepLesson[];
}

export interface FlowStepWithAppointmentType extends FlowStep {
  appointment_type: { id: string; name: string; duration_minutes: number } | null;
}

// ── Inputs ────────────────────────────────────────────────────

export interface CreateFlowInput {
  name: string;
  description?: string;
  campus_id?: string;
  is_default?: boolean;
  /** Optional override; defaults to the current user's profile.church_id. */
  church_id?: string;
}

export interface UpdateFlowInput {
  name?: string;
  description?: string;
  campus_id?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export type AssessmentKindValue =
  | 'personal'
  | 'connect_with_god'
  | 'spiritual_gifts';

export interface CreateFlowStepInput {
  flow_id: string;
  title: string;
  description?: string;
  step_type: FlowStepType;
  order_index: number;
  /** Defaults to order_index (own phase) when omitted. */
  phase_index?: number;
  appointment_type_id?: string;
  assessment_kind?: AssessmentKindValue | null;
  trigger_kind?: FlowTriggerKind;
  output_kind?: FlowOutputKind;
  is_required?: boolean;
  /** Lesson ids for step_type='video'. Order matches array order. */
  lesson_ids?: string[];
}

export interface UpdateFlowStepInput {
  title?: string;
  description?: string;
  step_type?: FlowStepType;
  order_index?: number;
  phase_index?: number;
  appointment_type_id?: string | null;
  assessment_kind?: AssessmentKindValue | null;
  trigger_kind?: FlowTriggerKind;
  output_kind?: FlowOutputKind;
  is_required?: boolean;
  /** When provided, replaces the linked lessons set entirely. */
  lesson_ids?: string[];
}

export interface ReorderFlowStepsInput {
  flow_id: string;
  /** Ordered array of step IDs — index 0 becomes order_index 0 */
  step_ids: string[];
}
