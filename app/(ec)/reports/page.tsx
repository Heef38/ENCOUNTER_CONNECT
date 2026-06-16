import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import {
  getConnectorActivity,
  getFlowCompletionStats,
} from '@/lib/reports/queries';

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default async function ReportsPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id ?? null;

  if (!churchId) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Reports
        </h1>
        <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-sm text-foreground-muted">
          Reports are scoped to a single church. Sign in as a church or campus
          admin to view them.
        </div>
      </div>
    );
  }

  const [flows, connectors] = await Promise.all([
    getFlowCompletionStats(churchId),
    getConnectorActivity(churchId),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Reports
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Flow completion, connector activity, and a full participant export.
            </p>
          </div>
          <a href="/api/reports/participants" download>
            <Button size="sm" variant="outline">
              <Download className="h-3.5 w-3.5" />
              Export participants (CSV)
            </Button>
          </a>
        </div>
      </div>

      {/* Flow completion ───────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">
          Flow completion
        </h2>
        {flows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
            No flows yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH>Flow</TH>
                  <TH>Steps</TH>
                  <TH>Enrolled</TH>
                  <TH>In progress</TH>
                  <TH>Finished</TH>
                  <TH>Completion</TH>
                </TR>
              </THead>
              <TBody>
                {flows.map((f) => (
                  <TR key={f.flowId}>
                    <TD>
                      <Link
                        href={`/flows/${f.flowId}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {f.flowName}
                      </Link>
                      {!f.isActive && (
                        <Badge tone="neutral" className="ml-2">
                          Inactive
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-foreground-muted">{f.stepCount}</TD>
                    <TD className="text-foreground">{f.enrolled}</TD>
                    <TD className="text-foreground-muted">{f.inProgress}</TD>
                    <TD className="text-foreground-muted">{f.finished}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: pct(f.completionRate) }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-foreground-muted">
                          {f.enrolled === 0 ? '—' : pct(f.completionRate)}
                        </span>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      {/* Connector activity ───────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">
          Connector activity
        </h2>
        {connectors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-sm text-foreground-muted">
            No active connectors yet.
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface shadow-sm">
            <Table>
              <THead>
                <TR>
                  <TH>Connector</TH>
                  <TH>Active</TH>
                  <TH>Finished</TH>
                  <TH>Total</TH>
                  <TH>Upcoming meetings</TH>
                  <TH>Avg days since action</TH>
                </TR>
              </THead>
              <TBody>
                {connectors.map((c) => (
                  <TR key={c.connectorId}>
                    <TD>
                      <Link
                        href={`/connectors/${c.connectorId}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {c.name}
                      </Link>
                    </TD>
                    <TD className="text-foreground">{c.active}</TD>
                    <TD className="text-foreground-muted">{c.finished}</TD>
                    <TD className="text-foreground-muted">{c.totalAssigned}</TD>
                    <TD className="text-foreground-muted">{c.upcomingMeetings}</TD>
                    <TD className="text-foreground-muted">
                      {c.avgDaysSinceAction == null ? '—' : `${c.avgDaysSinceAction}d`}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
