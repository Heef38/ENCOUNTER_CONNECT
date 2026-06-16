import Link from 'next/link';
import { Plus, AlertTriangle } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listFlows } from '@/lib/flows/services';
import { getDefaultFlowCoverage } from '@/lib/flows/health';
import { requireStaff } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default async function FlowsPage() {
  const session = await requireStaff();
  const supabase = await createServerSupabaseClient();
  const churchId = session.profile?.church_id ?? null;
  const [result, coverage] = await Promise.all([
    listFlows(supabase),
    churchId ? getDefaultFlowCoverage(supabase, churchId) : Promise.resolve(null),
  ]);
  const flows = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Flows
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">Connection journey templates</p>
        </div>
        <Link href="/flows/new">
          <Button size="md">
            <Plus className="h-4 w-4" />
            New Flow
          </Button>
        </Link>
      </div>

      {coverage && !coverage.ok && (
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warning" />
          <div className="text-sm text-foreground">
            <p className="font-medium">New signups won&apos;t be auto-enrolled into a journey.</p>
            {!coverage.usableChurchWideDefault && (
              <p className="mt-1 text-foreground-muted">
                There&apos;s no church-wide default flow with steps, so church-wide
                signups land with an empty journey. Mark an active flow as{' '}
                <span className="font-medium">Default</span> (with no campus) to fix it.
              </p>
            )}
            {coverage.campusesWithoutCoverage.length > 0 && (
              <p className="mt-1 text-foreground-muted">
                These campuses have no default flow:{' '}
                <span className="font-medium">
                  {coverage.campusesWithoutCoverage.map((c) => c.name).join(', ')}
                </span>
                . Set a campus default, or a church-wide one as a fallback.
              </p>
            )}
            <Link href="/flows/new" className="mt-2 inline-block text-primary hover:underline">
              Create a default flow →
            </Link>
          </div>
        </div>
      )}

      {flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
          <p className="text-sm text-foreground-muted">No flows yet.</p>
          <Link href="/flows/new" className="mt-2 block text-sm text-primary hover:underline">
            Create your first flow →
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {flows.map((flow) => (
            <Link
              key={flow.id}
              href={`/flows/${flow.id}`}
              className="group rounded-lg border border-border bg-surface p-5 shadow-sm transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground group-hover:text-primary">
                      {flow.name}
                    </p>
                    {flow.is_default && <Badge tone="info">Default</Badge>}
                  </div>
                  {flow.description && (
                    <p className="mt-1 text-sm text-foreground-muted line-clamp-2">{flow.description}</p>
                  )}
                  {flow.campus && (
                    <p className="mt-1 text-xs text-foreground-subtle">{flow.campus.name}</p>
                  )}
                </div>
                <Badge tone={flow.is_active ? 'success' : 'neutral'}>
                  {flow.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-sm text-foreground-muted">
                  <span className="font-medium text-foreground">{flow.step_count}</span>{' '}
                  {flow.step_count === 1 ? 'step' : 'steps'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!result.success && (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">{result.error}</p>
      )}
    </div>
  );
}
