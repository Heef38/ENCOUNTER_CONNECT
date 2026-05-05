import Link from 'next/link';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ensureAndOpenDefinition } from '@/lib/assessments/actions';
import type { AssessmentKind } from '@/lib/assessments/types';

const KINDS: { kind: AssessmentKind; label: string; description: string }[] = [
  {
    kind: 'personal',
    label: 'Personal Assessment',
    description: 'Get to know each participant — background, family, life stage, motivations.',
  },
  {
    kind: 'connect_with_god',
    label: 'Connect with God',
    description: 'Where someone is in their spiritual journey and how they want to grow.',
  },
  {
    kind: 'spiritual_gifts',
    label: 'Spiritual Gifts',
    description: 'Identify gifts so you can connect people to the right serve teams and roles.',
  },
];

interface DefinitionRow {
  id: string;
  kind: AssessmentKind;
  name: string;
  is_active: boolean;
  version: number;
  questions: { count: number }[] | null;
}

export default async function AssessmentsSettingsPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('assessment_definitions')
    .select('id, kind, name, is_active, version, questions:assessment_questions(count)')
    .order('version', { ascending: false });

  if (session.profile?.church_id) {
    query = query.eq('church_id', session.profile.church_id);
  }

  const { data } = await query;
  const definitions = (data ?? []) as unknown as DefinitionRow[];

  const byKind = new Map<AssessmentKind, DefinitionRow>();
  for (const d of definitions) {
    if (!byKind.has(d.kind)) byKind.set(d.kind, d);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Settings
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Assessments
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Three assessment types ship with Encounter Connect. Customize the questions, scoring,
          and active status for each.
        </p>
      </div>

      <div className="grid gap-3">
        {KINDS.map(({ kind, label, description }) => {
          const def = byKind.get(kind);
          const questionCount = def?.questions?.[0]?.count ?? 0;

          async function open() {
            'use server';
            await ensureAndOpenDefinition(kind);
          }

          return (
            <div
              key={kind}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{label}</span>
                  {def ? (
                    def.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )
                  ) : (
                    <Badge tone="warning">Not configured</Badge>
                  )}
                  {def && (
                    <span className="text-xs text-foreground-subtle">
                      v{def.version} · {questionCount} question
                      {questionCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground-muted">{description}</p>
              </div>

              {def ? (
                <Link href={`/settings/assessments/${def.id}`}>
                  <Button variant="outline" size="sm">
                    Edit
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              ) : (
                <form action={open}>
                  <Button type="submit" size="sm">
                    Set up
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
