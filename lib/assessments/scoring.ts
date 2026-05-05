import type {
  AssessmentQuestion,
  AssessmentCategory,
  ScoringOption,
  ComputedScore,
  QuestionType,
} from './types';

/**
 * Normalizes a question's `options` field into a list of scoring-aware
 * options. Accepts either:
 *   - a list of strings: each gets default points = 1
 *   - a list of { label, points } objects
 *   - a list of { label, points } where points is a numeric string
 */
export function parseScoringOptions(raw: unknown): ScoringOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry): ScoringOption => {
    if (typeof entry === 'string') {
      return { label: entry, points: 1 };
    }
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const label = String(obj.label ?? obj.value ?? '');
      const pointsRaw = obj.points ?? obj.score ?? 1;
      const points =
        typeof pointsRaw === 'number'
          ? pointsRaw
          : Number.parseFloat(String(pointsRaw)) || 0;
      return { label, points };
    }
    return { label: String(entry), points: 1 };
  });
}

/**
 * Returns the raw point value contributed by a single response, BEFORE
 * the question weight is applied. Returns 0 for unscored types
 * (text / long_text) or empty answers.
 */
export function rawPointsForResponse(
  questionType: QuestionType,
  options: ScoringOption[],
  responseValue: unknown,
): number {
  if (responseValue === null || responseValue === undefined || responseValue === '') {
    return 0;
  }

  switch (questionType) {
    case 'scale': {
      const n = typeof responseValue === 'number'
        ? responseValue
        : Number.parseFloat(String(responseValue));
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean': {
      if (typeof responseValue === 'boolean') return responseValue ? 1 : 0;
      const s = String(responseValue).toLowerCase();
      return s === 'true' || s === 'yes' ? 1 : 0;
    }
    case 'choice': {
      const label = String(responseValue);
      const opt = options.find((o) => o.label === label);
      return opt?.points ?? 0;
    }
    case 'multi_choice': {
      if (!Array.isArray(responseValue)) return 0;
      return (responseValue as unknown[]).reduce<number>((sum, v) => {
        const label = String(v);
        const opt = options.find((o) => o.label === label);
        return sum + (opt?.points ?? 0);
      }, 0);
    }
    default:
      return 0; // text / long_text
  }
}

/**
 * Computes the participant's total points per category across all
 * scored questions, then returns the top-N categories.
 */
export function computeAssessmentScore(
  questions: AssessmentQuestion[],
  categories: AssessmentCategory[],
  responsesByQuestion: Map<string, unknown>,
  topN = 3,
): ComputedScore {
  const totals: Record<string, number> = {};
  for (const cat of categories) totals[cat.id] = 0;

  for (const q of questions) {
    if (!q.category_id) continue;
    if (!(q.category_id in totals)) continue;

    const value = responsesByQuestion.get(q.id);
    const opts = parseScoringOptions(q.options);
    const raw = rawPointsForResponse(q.question_type, opts, value);
    const weight = Number.isFinite(q.weight) ? q.weight : 1;
    totals[q.category_id] += raw * weight;
  }

  const ranked = categories
    .map((c) => ({
      category_id: c.id,
      label: c.label,
      points: totals[c.id] ?? 0,
    }))
    .sort((a, b) => b.points - a.points);

  return {
    totals,
    top: ranked.slice(0, topN),
    top_n: topN,
  };
}
