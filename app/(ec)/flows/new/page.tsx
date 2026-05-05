import Link from 'next/link';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NewFlowForm } from '@/components/flows/new-flow-form';
import { seedAndOpenEncounterConnectFlow } from '@/lib/flows/seed-actions';
import { Button } from '@/components/ui/button';

export default async function NewFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireStaff();
  const { error } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: campuses } = await supabase
    .from('campuses')
    .select('id, name')
    .eq('church_id', session.profile?.church_id ?? '')
    .eq('is_active', true)
    .order('name');

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link
          href="/flows"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Flows
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New Flow
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Create a connection journey template.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <form action={seedAndOpenEncounterConnectFlow}>
        <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Use the Encounter Connect template
              </p>
              <p className="mt-1 text-xs text-foreground-muted">
                Pre-built 5-step journey: welcome videos → personal assessment →
                connect with god → spiritual gifts → first meeting (auto-matched
                connector).
              </p>
              <Button type="submit" size="sm" className="mt-3">
                Use template
              </Button>
            </div>
          </div>
        </div>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-foreground-subtle">or</span>
        </div>
      </div>

      <NewFlowForm campuses={campuses ?? []} />
    </div>
  );
}
