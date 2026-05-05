import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import { requireConnector } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { listConnectorParticipants } from '@/lib/connectors/journey-queries';

export default async function ConnectorHomePage() {
  const { connectorId } = await requireConnector();
  const supabase = await createServerSupabaseClient();

  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id, campus_id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)')
    .eq('id', connectorId)
    .maybeSingle();

  const myCampusId =
    (connectorRow as { campus_id: string | null } | null)?.campus_id ?? null;

  const myParticipants = await listConnectorParticipants(supabase, {
    connectorId,
    scope: 'mine',
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          My participants
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          People you&apos;re connecting with. Click any of them to see their journey,
          assessment results, and your one-on-one prep.
        </p>
      </div>

      {myParticipants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Users className="h-8 w-8 text-foreground-subtle" />
            <p className="text-sm text-foreground-muted">
              No participants assigned yet. When someone gets matched with you,
              they&apos;ll show up here.
            </p>
            {myCampusId && (
              <Link
                href="/connector/campus"
                className="text-sm text-primary hover:underline"
              >
                See all participants at this campus →
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {myParticipants.map((p) => (
            <li key={p.id}>
              <Link href={`/connector/participants/${p.id}`}>
                <Card className="transition hover:border-primary/60 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                      {(p.first_name?.[0] ?? '').toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-foreground-muted">
                        {p.current_step_title ?? 'No active step'}
                        {p.last_action_at && (
                          <>
                            {' · '}
                            Last activity{' '}
                            {new Date(p.last_action_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(p.status)}>
                        {p.status.replace('_', ' ')}
                      </Badge>
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

function statusTone(status: string): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'completed':   return 'success';
    case 'in_progress': return 'info';
    case 'inactive':    return 'warning';
    default:            return 'neutral';
  }
}
