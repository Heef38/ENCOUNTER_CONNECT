'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import type { AssessmentKind, QuestionType } from './types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const KIND_LABELS: Record<AssessmentKind, string> = {
  personal:         'Personal Assessment',
  connect_with_god: 'Connect with God',
  spiritual_gifts:  'Spiritual Gifts',
};

const VALID_TYPES: QuestionType[] = [
  'text',
  'long_text',
  'scale',
  'choice',
  'multi_choice',
  'boolean',
];

function parseInt0(raw: FormDataEntryValue | null, fallback = 0): number {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parses options textarea input. Each line is either:
 *   - "Label" — defaults to 1 point
 *   - "Label | 5" — explicit point value
 * Output is { label, points } pairs.
 */
function parseOptions(raw: FormDataEntryValue | null): { label: string; points: number }[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf('|');
      if (idx < 0) return { label: line, points: 1 };
      const label = line.slice(0, idx).trim();
      const pointsStr = line.slice(idx + 1).trim();
      const points = Number.parseFloat(pointsStr);
      return {
        label: label || line,
        points: Number.isFinite(points) ? points : 1,
      };
    });
}

function parseWeight(raw: FormDataEntryValue | null): number {
  if (typeof raw !== 'string' || !raw.trim()) return 1;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Returns the existing definition for `kind` in the user's church, or creates
 * a placeholder one. Used so the per-kind editor URL is stable.
 */
export async function getOrCreateDefinition(
  kind: AssessmentKind,
): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const supabase = await createServerSupabaseClient();
  const existing = await supabase
    .from('assessment_definitions')
    .select('id')
    .eq('church_id', churchId)
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data) return { ok: true, id: existing.data.id };

  const { data, error } = await supabase
    .from('assessment_definitions')
    .insert({
      church_id: churchId,
      kind,
      name: KIND_LABELS[kind],
      description: null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment.create',
    entity_type: 'assessment_definition',
    entity_id: data.id,
    metadata: { kind, name: KIND_LABELS[kind] },
  });

  revalidatePath('/settings/assessments');
  return { ok: true, id: data.id };
}

export async function updateDefinition(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Name is required.' };

  const description = String(formData.get('description') ?? '').trim();
  const is_active = formData.get('is_active') === 'on';

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('assessment_definitions')
    .update({
      name,
      description: description || null,
      is_active,
    })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment.update',
    entity_type: 'assessment_definition',
    entity_id: id,
    metadata: { name, is_active },
  });

  revalidatePath('/settings/assessments');
  revalidatePath(`/settings/assessments/${id}`);
  return { ok: true, id };
}

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

export async function createQuestion(
  assessmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const prompt = String(formData.get('prompt') ?? '').trim();
  if (!prompt) return { ok: false, error: 'Prompt is required.' };

  const typeRaw = String(formData.get('question_type') ?? 'text');
  const question_type: QuestionType = (
    VALID_TYPES.includes(typeRaw as QuestionType) ? typeRaw : 'text'
  ) as QuestionType;

  const category_id = nullable(formData.get('category_id'));
  const weight = parseWeight(formData.get('weight'));
  const order_index = parseInt0(formData.get('order_index'));
  const is_required = formData.get('is_required') === 'on';
  const options = parseOptions(formData.get('options'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('assessment_questions')
    .insert({
      assessment_id: assessmentId,
      prompt,
      question_type,
      options,
      category_id,
      weight,
      order_index,
      is_required,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_question.create',
    entity_type: 'assessment_question',
    entity_id: data.id,
    metadata: { assessment_id: assessmentId, prompt, question_type, weight, category_id },
  });

  revalidatePath(`/settings/assessments/${assessmentId}`);
  return { ok: true, id: data.id };
}

export async function updateQuestion(
  questionId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const prompt = String(formData.get('prompt') ?? '').trim();
  if (!prompt) return { ok: false, error: 'Prompt is required.' };

  const typeRaw = String(formData.get('question_type') ?? 'text');
  const question_type: QuestionType = (
    VALID_TYPES.includes(typeRaw as QuestionType) ? typeRaw : 'text'
  ) as QuestionType;

  const category_id = nullable(formData.get('category_id'));
  const weight = parseWeight(formData.get('weight'));
  const order_index = parseInt0(formData.get('order_index'));
  const is_required = formData.get('is_required') === 'on';
  const options = parseOptions(formData.get('options'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('assessment_questions')
    .update({
      prompt,
      question_type,
      options,
      category_id,
      weight,
      order_index,
      is_required,
    })
    .eq('id', questionId)
    .select('assessment_id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_question.update',
    entity_type: 'assessment_question',
    entity_id: questionId,
    metadata: { prompt, question_type, weight, category_id },
  });

  revalidatePath(`/settings/assessments/${data.assessment_id}`);
  return { ok: true, id: questionId };
}

export async function deleteQuestion(
  questionId: string,
  assessmentId: string,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('assessment_questions')
    .delete()
    .eq('id', questionId);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_question.delete',
    entity_type: 'assessment_question',
    entity_id: questionId,
    metadata: { assessment_id: assessmentId },
  });

  revalidatePath(`/settings/assessments/${assessmentId}`);
  return { ok: true };
}

export async function ensureAndOpenDefinition(kind: AssessmentKind): Promise<void> {
  const result = await getOrCreateDefinition(kind);
  if (result.ok && result.id) {
    redirect(`/settings/assessments/${result.id}`);
  }
}

// ── Categories ───────────────────────────────────────────────

function slugifyKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export async function createCategory(
  assessmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const label = String(formData.get('label') ?? '').trim();
  if (!label) return { ok: false, error: 'Label is required.' };

  const keyRaw = String(formData.get('key') ?? '').trim();
  const key = keyRaw ? slugifyKey(keyRaw) : slugifyKey(label);
  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const order_index = parseInt0(formData.get('order_index'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('assessment_categories')
    .insert({
      assessment_id: assessmentId,
      key,
      label,
      description,
      body,
      order_index,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_category.create',
    entity_type: 'assessment_category',
    entity_id: data.id,
    metadata: { assessment_id: assessmentId, label, key },
  });

  revalidatePath(`/settings/assessments/${assessmentId}`);
  return { ok: true, id: data.id };
}

export async function updateCategory(
  categoryId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireCampusAdmin();

  const label = String(formData.get('label') ?? '').trim();
  if (!label) return { ok: false, error: 'Label is required.' };

  const keyRaw = String(formData.get('key') ?? '').trim();
  const key = keyRaw ? slugifyKey(keyRaw) : slugifyKey(label);
  const description = nullable(formData.get('description'));
  const body = nullable(formData.get('body'));
  const order_index = parseInt0(formData.get('order_index'));

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('assessment_categories')
    .update({ key, label, description, body, order_index })
    .eq('id', categoryId)
    .select('assessment_id')
    .single();

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_category.update',
    entity_type: 'assessment_category',
    entity_id: categoryId,
    metadata: { label, key },
  });

  revalidatePath(`/settings/assessments/${data.assessment_id}`);
  return { ok: true, id: categoryId };
}

export async function deleteCategory(
  categoryId: string,
  assessmentId: string,
): Promise<ActionResult> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('assessment_categories')
    .delete()
    .eq('id', categoryId);

  if (error) return { ok: false, error: error.message };

  await recordAudit({
    action: 'assessment_category.delete',
    entity_type: 'assessment_category',
    entity_id: categoryId,
    metadata: { assessment_id: assessmentId },
  });

  revalidatePath(`/settings/assessments/${assessmentId}`);
  return { ok: true };
}
