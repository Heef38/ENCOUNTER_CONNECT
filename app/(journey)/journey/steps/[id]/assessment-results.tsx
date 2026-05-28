import { Sparkle } from 'lucide-react';
import type { AssessmentCategory, ComputedScore } from '@/lib/assessments/types';

interface Props {
  computed: ComputedScore;
  categories: AssessmentCategory[];
}

const PLACE_LABEL = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

export function AssessmentResults({ computed, categories }: Props) {
  const top = computed?.top ?? [];
  const catsById = new Map(categories.map((c) => [c.id, c]));

  if (top.length === 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
        No results to show. The assessment may have been completed before scoring was set up.
      </div>
    );
  }

  const filteredTop = top.filter((t) => t.points > 0);
  const display = filteredTop.length > 0 ? filteredTop : top;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          <Sparkle className="h-3.5 w-3.5" />
          Your top {Math.min(computed.top_n ?? 3, display.length)}
        </p>
        <ol className="mt-3 space-y-2">
          {display.slice(0, computed.top_n ?? 3).map((entry, i) => (
            <li
              key={entry.category_id}
              className="flex items-baseline justify-between gap-3 border-b border-border last:border-b-0 pb-2 last:pb-0"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  {PLACE_LABEL[i] ?? `#${i + 1}`}
                </span>
                <span className="text-base font-medium text-foreground">
                  {entry.label}
                </span>
              </span>
              <span className="text-sm tabular-nums text-foreground-muted">
                {entry.points.toFixed(0)} pts
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-6">
        {display.slice(0, computed.top_n ?? 3).map((entry, i) => {
          const cat = catsById.get(entry.category_id);
          if (!cat) return null;
          return (
            <article
              key={entry.category_id}
              className="rounded-lg border border-border bg-surface p-5"
            >
              <header className="mb-3 border-b border-border pb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {PLACE_LABEL[i] ?? `#${i + 1}`}
                </p>
                <h3 className="mt-1 font-display text-xl font-semibold text-foreground">
                  {cat.label}
                </h3>
                {cat.description && (
                  <p className="mt-1 text-sm text-foreground-muted">{cat.description}</p>
                )}
              </header>

              {cat.body ? (
                <div className="prose-document text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {cat.body}
                </div>
              ) : (
                <p className="text-sm text-foreground-subtle">
                  Your campus team hasn&apos;t added content for this category yet.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
