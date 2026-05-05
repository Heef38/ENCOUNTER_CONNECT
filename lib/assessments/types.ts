export type AssessmentKind =
  | 'personal'
  | 'connect_with_god'
  | 'spiritual_gifts';

export type QuestionType =
  | 'text'
  | 'long_text'
  | 'scale'
  | 'choice'
  | 'multi_choice'
  | 'boolean';

export interface AssessmentDefinition {
  id: string;
  church_id: string;
  kind: AssessmentKind;
  name: string;
  description: string | null;
  scoring: Record<string, unknown>;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  prompt: string;
  question_type: QuestionType;
  options: unknown[];
  category: string | null;
  category_id: string | null;
  weight: number;
  order_index: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssessmentCategory {
  id: string;
  assessment_id: string;
  key: string;
  label: string;
  description: string | null;
  body: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/** Per-option point shape used for choice / multi_choice questions. */
export interface ScoringOption {
  label: string;
  points: number;
}

/** Result shape stored in `assessment_results.computed_score`. */
export interface ComputedScore {
  totals: Record<string, number>;
  top: Array<{
    category_id: string;
    label: string;
    points: number;
  }>;
  top_n: number;
}

export interface AssessmentResponse {
  id: string;
  assessment_id: string;
  participant_id: string;
  question_id: string;
  response_value: unknown;
  created_at: string;
  updated_at: string;
}

export interface AssessmentResult {
  id: string;
  assessment_id: string;
  participant_id: string;
  computed_score: Record<string, unknown>;
  notes: string | null;
  completed_at: string;
}

export interface CreateAssessmentInput {
  church_id: string;
  kind: AssessmentKind;
  name: string;
  description?: string;
  scoring?: Record<string, unknown>;
}

export interface CreateQuestionInput {
  assessment_id: string;
  prompt: string;
  question_type?: QuestionType;
  options?: unknown[];
  category?: string;
  order_index?: number;
  is_required?: boolean;
}
