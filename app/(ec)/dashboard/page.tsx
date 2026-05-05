import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireStaff } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { MonthCalendar } from '@/components/dashboard/month-calendar';
import {
  ConnectorLoad,
  InProgressTable,
  NeedsAttentionPanel,
  Pills,
  Plate,
} from '@/components/dashboard/sections';
import {
  getConnectorLoad,
  getDashboardContext,
  getInProgressConnections,
  getMonthBookings,
  getMyPlate,
  getNeedsAttention,
  getPills,
} from '@/lib/dashboard/queries';

interface SearchParams {
  month?: string;
  scope?: 'all' | 'mine';
}

function parseMonth(value: string | undefined): { year: number; month: number } {
  if (value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireStaff();
  const params = await searchParams;
  const ctx = await getDashboardContext(session);

  const { year, month } = parseMonth(params.month);
  const scope: 'all' | 'mine' =
    params.scope === 'all' || params.scope === 'mine'
      ? params.scope
      : ctx.isConnector && !ctx.isAdmin
        ? 'mine'
        : ctx.isConnector
          ? 'mine'
          : 'all';

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);

  const [pills, events, plate, attention, connectorLoad, inProgress] = await Promise.all([
    getPills(ctx),
    getMonthBookings(ctx, monthStart, monthEnd, scope),
    ctx.isConnector ? getMyPlate(ctx) : Promise.resolve([]),
    getNeedsAttention(ctx),
    getConnectorLoad(ctx),
    getInProgressConnections(ctx),
  ]);

  const greetingName =
    [ctx.session.profile?.first_name, ctx.session.profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || ctx.session.email;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {greetingForHour()}, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {ctx.isAdmin
              ? 'Everything moving through the connection journey.'
              : ctx.isConnector
                ? 'Your assigned participants and upcoming appointments.'
                : 'Church connection overview.'}
          </p>
        </div>
        {ctx.isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/participants/new">
              <Button size="md">
                <Plus className="h-4 w-4" />
                Participant
              </Button>
            </Link>
            <Link href="/connectors">
              <Button size="md" variant="outline">
                <Plus className="h-4 w-4" />
                Connector
              </Button>
            </Link>
          </div>
        )}
      </div>

      <Pills pills={pills} showAttention={ctx.isAdmin} />

      {ctx.isAdmin && <NeedsAttentionPanel data={attention} />}

      <MonthCalendar
        year={year}
        month={month}
        events={events}
        baseHref="/dashboard"
        extraParams={{ scope: params.scope }}
        canToggleScope={ctx.isAdmin && ctx.isConnector}
        scope={scope}
      />

      {ctx.isConnector && <Plate items={plate} />}

      {ctx.isAdmin && <ConnectorLoad rows={connectorLoad} />}

      <InProgressTable rows={inProgress} showConnectorColumn={ctx.isAdmin} />
    </div>
  );
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
