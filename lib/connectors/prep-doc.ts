import type { AssessmentKind, ComputedScore, AssessmentCategory } from '@/lib/assessments/types';

export const KIND_LABEL: Record<AssessmentKind, string> = {
  personal:         'Personal',
  connect_with_god: 'Connect with God',
  spiritual_gifts:  'Spiritual Gifts',
};

export interface PrepParticipant {
  first_name: string;
  last_name: string;
  status: string;
  signed_up_at: string | null;
  campus: { name: string } | null;
}

export interface PrepProgressStep {
  status: string;
  flow_step: { title: string } | null;
}

export interface PrepResult {
  assessment_id: string;
  computed_score: ComputedScore;
  assessment: { kind: AssessmentKind; name: string } | null;
}

/**
 * Builds a plain-text 1:1 prep doc from a participant's journey + assessment
 * results. Shared by the connector participant view and the meeting room.
 */
export function generateOneOnOneDoc(input: {
  participant: PrepParticipant;
  progress: PrepProgressStep[];
  results: PrepResult[];
  categoriesByAssessment: Map<string, AssessmentCategory[]>;
}): string {
  const { participant, progress, results, categoriesByAssessment } = input;
  const lines: string[] = [];

  lines.push(`# 1:1 prep — ${participant.first_name} ${participant.last_name}`);
  lines.push('');

  lines.push('## Where they are');
  if (participant.campus) lines.push(`- Campus: ${participant.campus.name}`);
  lines.push(`- Status: ${participant.status.replace('_', ' ')}`);
  if (participant.signed_up_at) {
    lines.push(`- Signed up: ${new Date(participant.signed_up_at).toLocaleDateString()}`);
  }
  const completedTitles = progress
    .filter((p) => p.status === 'completed' && p.flow_step)
    .map((p) => p.flow_step!.title);
  if (completedTitles.length > 0) {
    lines.push('- Completed:');
    for (const t of completedTitles) lines.push(`  - ${t}`);
  }
  const currentTitles = progress
    .filter((p) => p.status === 'in_progress' && p.flow_step)
    .map((p) => p.flow_step!.title);
  if (currentTitles.length > 0) {
    lines.push('- Currently working on:');
    for (const t of currentTitles) lines.push(`  - ${t}`);
  }
  lines.push('');

  if (results.length > 0) {
    lines.push('## Assessment highlights');
    for (const r of results) {
      const kindLabel = r.assessment ? KIND_LABEL[r.assessment.kind] : 'Assessment';
      lines.push(`### ${kindLabel}`);
      const top = r.computed_score?.top ?? [];
      const cats = categoriesByAssessment.get(r.assessment_id) ?? [];
      if (top.length === 0) {
        lines.push('_No top categories computed._');
      } else {
        for (const t of top) {
          lines.push(`- **${t.label}** — ${t.points.toFixed(1)} pts`);
          const body = cats.find((c) => c.id === t.category_id)?.body;
          if (body) {
            const trimmed = body.length > 220 ? `${body.slice(0, 220)}…` : body;
            lines.push(`  ${trimmed.replace(/\n+/g, ' ')}`);
          }
        }
      }
      lines.push('');
    }

    lines.push('## Suggested conversation starters');
    for (const r of results) {
      const kindLabel = r.assessment ? KIND_LABEL[r.assessment.kind] : 'Assessment';
      const top = r.computed_score?.top ?? [];
      if (top.length === 0) continue;
      lines.push(`- ${kindLabel}: "Tell me about a time you've experienced ${top[0].label.toLowerCase()}."`);
    }
    lines.push('');
  } else {
    lines.push('## Assessments');
    lines.push('_No assessments completed yet — let\'s talk about how the journey is going so far._');
    lines.push('');
  }

  lines.push('## Notes from this meeting');
  lines.push('_(jot down what you talk about — pen-and-paper for now)_');

  return lines.join('\n');
}
