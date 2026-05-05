import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { listFlows } from '@/lib/flows/services';
import { requireStaff } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default async function FlowsPage() {
  await requireStaff();
  const supabase = await createServerSupabaseClient();
  const result = await listFlows(supabase);
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
