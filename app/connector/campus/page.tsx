import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { requireConnector } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listConnectorParticipants } from '@/lib/connectors/journey-queries';

export default async function ConnectorCampusPage() {
  const { connectorId } = await requireConnector();
  const supabase = await createServerSupabaseClient();
  const participants = await listConnectorParticipants(supabase, {
    connectorId,
    scope: 'campus',
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          All campus participants
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Everyone going through a journey at your campus. Read-only — you can
          only act on people assigned to you.
        </p>
      </div>

      {participants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Users className="h-8 w-8 text-foreground-subtle" />
            <p className="text-sm text-foreground-muted">
              No participants at this campus yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {participants.map((p) => (
            <li key={p.id}>
              <Link href={`/connector/participants/${p.id}`}>
                <Card className="transition hover:border-primary/60 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
                      {(p.first_name?.[0] ?? '').toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.first_name} {p.last_name}
                        {p.is_mine && (
                          <span className="ml-2 inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Mine
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-foreground-muted">
                        {p.current_step_title ?? 'No active step'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{p.status.replace('_', ' ')}</Badge>
                      {p.progress_total > 0 && (
                        <span className="text-xs text-foreground-subtle">
                          {p.progress_done}/{p.progress_total}
                        </span>
                      )}
                      <ArrowRight className="h-4 w-4 text-foreground-subtle" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
