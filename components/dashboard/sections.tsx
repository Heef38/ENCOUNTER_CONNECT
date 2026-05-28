import Link from 'next/link';
import { AlertTriangle, Calendar, Clock, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type {
  ActivityItem,
  ConnectorLoadRow,
  DashboardPills,
  InProgressRow,
  NeedsAttention,
  PlateItem,
} from '@/lib/dashboard/queries';

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Pills ───────────────────────────────────────────────────────

export function Pills({
  pills,
  showAttention,
}: {
  pills: DashboardPills;
  showAttention: boolean;
}) {
  return (
    <div className={cn('grid gap-3', showAttention ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      <PillCard
        icon={<Users className="h-4 w-4" />}
        label="Active connections"
        value={pills.activeConnections}
        tone="primary"
      />
      <PillCard
        icon={<UserPlus className="h-4 w-4" />}
        label="New this week"
        value={pills.newThisWeek}
        tone="info"
      />
      {showAttention && (
        <PillCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Needs attention"
          value={pills.needsAttention}
          tone={pills.needsAttention > 0 ? 'warning' : 'neutral'}
        />
      )}
    </div>
  );
}

function PillCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'primary' | 'info' | 'warning' | 'neutral';
}) {
  const toneStyles: Record<typeof tone, string> = {
    primary: 'bg-primary/10 text-primary',
    info: 'bg-info-bg text-info',
    warning: 'bg-warning-bg text-warning',
    neutral: 'bg-surface-muted text-foreground-muted',
  };
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-md', toneStyles[tone])}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-foreground-muted">{label}</p>
        <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ── Plate (connector's queue) ───────────────────────────────────

export function Plate({ items }: { items: PlateItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
          Your plate
        </h2>
        <span className="text-xs text-foreground-muted">
          {items.length === 0 ? 'Nothing pending' : `${items.length} item${items.length === 1 ? '' : 's'}`}
        </span>
      </header>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-foreground-muted">
          You&apos;re all caught up.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.progressId} className="px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/participants/${item.participantId}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {item.participantName}
                  </Link>
                  <div className="mt-0.5 text-sm text-foreground-muted">
                    {item.stepTitle}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {item.bookingStartsAt ? (
                    <div className="flex items-center gap-1 text-info">
                      <Calendar className="h-3 w-3" />
                      {formatWhen(item.bookingStartsAt)}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-foreground-subtle">
                      <Clock className="h-3 w-3" />
                      {item.ageDays === 0 ? 'today' : `${item.ageDays}d old`}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Needs attention (admin) ─────────────────────────────────────

export function RecentActivityPanel({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <Clock className="h-4 w-4 text-foreground-subtle" />
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-foreground-muted">
          Nothing yet. Notifications and status updates will appear here as they happen.
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-3 px-5 py-3">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 flex-none rounded-full',
                  it.tone === 'success' && 'bg-success',
                  it.tone === 'danger' && 'bg-danger',
                  it.tone === 'warning' && 'bg-warning',
                  it.tone === 'info' && 'bg-info',
                  it.tone === 'neutral' && 'bg-border-strong',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{it.title}</p>
                {it.detail && (
                  <p className="truncate text-xs text-foreground-muted">{it.detail}</p>
                )}
              </div>
              <span className="flex-none text-xs text-foreground-subtle">
                {formatRelative(it.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NeedsAttentionPanel({ data }: { data: NeedsAttention }) {
  const buckets = [
    {
      key: 'unassigned',
      label: 'Unassigned',
      description: 'No connector yet',
      href: '/participants?status=new',
      tone: 'warning' as const,
      bucket: data.unassigned,
    },
    {
      key: 'stalled',
      label: 'Stalled',
      description: '14+ days no activity',
      href: '/participants?status=in_progress',
      tone: 'danger' as const,
      bucket: data.stalled,
    },
    {
      key: 'overdue',
      label: 'Overdue bookings',
      description: 'Past scheduled time',
      href: '/participants',
      tone: 'danger' as const,
      bucket: data.overdueBookings,
    },
  ];

  const total = buckets.reduce((sum, b) => sum + b.bucket.count, 0);

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
          Needs attention
        </h2>
        <span className="text-xs text-foreground-muted">
          {total === 0 ? 'Nothing flagged' : `${total} flagged`}
        </span>
      </header>
      <div className="grid gap-px bg-border sm:grid-cols-3">
        {buckets.map((b) => (
          <div key={b.key} className="flex flex-col bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{b.label}</div>
                <div className="text-xs text-foreground-muted">{b.description}</div>
              </div>
              <Badge tone={b.bucket.count > 0 ? b.tone : 'neutral'}>{b.bucket.count}</Badge>
            </div>
            {b.bucket.items.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {b.bucket.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground">{item.primary}</span>
                    <span className="shrink-0 text-xs text-foreground-muted">
                      {item.secondary}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-foreground-subtle">Clear.</p>
            )}
            {b.bucket.count > b.bucket.items.length && (
              <Link
                href={b.href}
                className="mt-3 text-xs text-primary hover:underline"
              >
                View all {b.bucket.count}
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Connector load (admin) ──────────────────────────────────────

export function ConnectorLoad({ rows }: { rows: ConnectorLoadRow[] }) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
          Connector load
        </h2>
        <Link href="/connectors" className="text-xs text-primary hover:underline">
          Manage
        </Link>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-foreground-muted">
          No active connectors yet.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Connector</TH>
              <TH>Active</TH>
              <TH>Avg days since action</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.connectorId}>
                <TD>
                  <Link
                    href={`/connectors/${r.connectorId}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {r.name}
                  </Link>
                </TD>
                <TD className="text-foreground">{r.activeCount}</TD>
                <TD className="text-foreground-muted">
                  {r.avgDaysSinceAction == null ? '—' : `${r.avgDaysSinceAction}d`}
                </TD>
                <TD>
                  {r.isHeavy ? (
                    <Badge tone="warning">Heavy</Badge>
                  ) : r.activeCount === 0 ? (
                    <Badge tone="neutral">Idle</Badge>
                  ) : (
                    <Badge tone="success">Healthy</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ── In-progress connections ─────────────────────────────────────

export function InProgressTable({
  rows,
  showConnectorColumn,
}: {
  rows: InProgressRow[];
  showConnectorColumn: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
          Connections in progress
        </h2>
        <Link
          href="/participants?status=in_progress"
          className="text-xs text-primary hover:underline"
        >
          View all
        </Link>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-foreground-muted">
          Nothing currently in progress.
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Campus</TH>
              <TH>Current step</TH>
              {showConnectorColumn && <TH>Connector</TH>}
              <TH>Last action</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link
                    href={`/participants/${r.id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {r.firstName} {r.lastName}
                  </Link>
                </TD>
                <TD className="text-foreground-muted">{r.campusName ?? '—'}</TD>
                <TD className="text-foreground-muted">{r.stepTitle ?? '—'}</TD>
                {showConnectorColumn && (
                  <TD className="text-foreground-muted">{r.connectorName ?? '—'}</TD>
                )}
                <TD className="text-foreground-muted">{formatRelative(r.lastActionAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
