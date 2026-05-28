'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AssessmentQuestion } from '@/lib/assessments/types';
import type { ActionResult } from '@/lib/journey/actions';

interface Props {
  questions: AssessmentQuestion[];
  existingResponses: Record<string, unknown>;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  isComplete: boolean;
}

export function AssessmentForm({
  questions,
  existingResponses,
  action,
  isComplete,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      // Refresh in place so the page re-renders with the scored results; the
      // participant then advances with the next-step arrow.
      if (result.ok) router.refresh();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      {questions.map((q, i) => {
        const fieldName = `q_${q.id}`;
        const current = existingResponses[q.id];

        return (
          <div
            key={q.id}
            className="space-y-2 rounded-lg border border-border bg-surface p-4"
          >
            <Label className="flex items-baseline gap-2 text-base font-medium">
              <span className="text-foreground-subtle">{i + 1}.</span>
              <span>
                {q.prompt}
                {q.is_required && <span className="text-danger"> *</span>}
              </span>
            </Label>

            {q.question_type === 'text' && (
              <Input
                name={fieldName}
                required={q.is_required}
                defaultValue={typeof current === 'string' ? current : ''}
                disabled={isComplete}
              />
            )}

            {q.question_type === 'long_text' && (
              <Textarea
                name={fieldName}
                rows={4}
                required={q.is_required}
                defaultValue={typeof current === 'string' ? current : ''}
                disabled={isComplete}
              />
            )}

            {q.question_type === 'scale' && (
              <div className="flex flex-wrap items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label
                    key={n}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-base"
                  >
                    <input
                      type="radio"
                      name={fieldName}
                      value={n}
                      defaultChecked={current === n}
                      required={q.is_required}
                      disabled={isComplete}
                      className="accent-primary"
                    />
                    {n}
                  </label>
                ))}
              </div>
            )}

            {q.question_type === 'choice' && (
              <div className="space-y-1.5">
                {(q.options as unknown[]).map((opt) => {
                  const value = String(opt);
                  return (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base"
                    >
                      <input
                        type="radio"
                        name={fieldName}
                        value={value}
                        defaultChecked={current === value}
                        required={q.is_required}
                        disabled={isComplete}
                        className="accent-primary"
                      />
                      {value}
                    </label>
                  );
                })}
              </div>
            )}

            {q.question_type === 'multi_choice' && (
              <div className="space-y-1.5">
                {(q.options as unknown[]).map((opt) => {
                  const value = String(opt);
                  const checked =
                    Array.isArray(current) &&
                    (current as unknown[]).map(String).includes(value);
                  return (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-base"
                    >
                      <input
                        type="checkbox"
                        name={fieldName}
                        value={value}
                        defaultChecked={checked}
                        disabled={isComplete}
                        className="accent-primary"
                      />
                      {value}
                    </label>
                  );
                })}
              </div>
            )}

            {q.question_type === 'boolean' && (
              <div className="flex items-center gap-3">
                {[
                  { value: 'true',  label: 'Yes' },
                  { value: 'false', label: 'No' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-base"
                  >
                    <input
                      type="radio"
                      name={fieldName}
                      value={opt.value}
                      defaultChecked={
                        current === (opt.value === 'true')
                      }
                      required={q.is_required}
                      disabled={isComplete}
                      className="accent-primary"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-base text-danger">
          {state.error}
        </div>
      )}

      {!isComplete && (
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit assessment'}
        </Button>
      )}
    </form>
  );
}
