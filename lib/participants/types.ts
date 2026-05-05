import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Enums ─────────────────────────────────────────────────────

export type ParticipantStatus =
  | 'new'
  | 'in_progress'
  | 'connected'
  | 'completed'
  | 'inactive';

export type ProgressStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped';

// ── Participant ───────────────────────────────────────────────

export interface Participant {
  id: string;
  church_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  campus_id: string | null;
  assigned_connector_id: string | null;
  status: ParticipantStatus;
  profile_id: string | null;
  notes: string | null;
  signed_up_at: string | null;
  last_action_at: string | null;
  current_step_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantWithRelations extends Participant {
  campus: { id: string; name: string } | null;
  connector: {
    id: string;
    profile: { first_name: string; last_name: string; email: string | null };
  } | null;
  progress: ParticipantProgress[];
}

// ── Participant Progress ───────────────────────────────────────

export interface ParticipantProgress {
  id: string;
  participant_id: string;
  flow_step_id: string;
  status: ProgressStatus;
  scheduled_event_id: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParticipantProgressWithStep extends ParticipantProgress {
  flow_step: {
    id: string;
    title: string;
    step_type: string;
    order_index: number;
    is_required: boolean;
  };
}

// ── Inputs ────────────────────────────────────────────────────

export interface CreateParticipantInput {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  campus_id?: string;
  assigned_connector_id?: string;
  notes?: string;
  /** Optional override; defaults to the current user's profile.church_id. */
  church_id?: string;
}

export interface UpdateParticipantInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  campus_id?: string;
  assigned_connector_id?: string;
  status?: ParticipantStatus;
  notes?: string;
}

export interface UpdateProgressInput {
  status: ProgressStatus;
  scheduled_event_id?: string;
  notes?: string;
  completed_at?: string;
}

// ── Filters ───────────────────────────────────────────────────

export interface ListParticipantsFilter {
  campus_id?: string;
  status?: ParticipantStatus;
  connector_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
