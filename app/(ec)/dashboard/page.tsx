import Link from 'next/link';
import { Plus } from 'lucide-react';
import { addMonths } from 'date-fns';
import { requireStaff } from '@/lib/auth/dal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MonthCalendar } from '@/components/dashboard/month-calendar';
import { ConnectorLoad, UpcomingAppointmentsList, Plate } from '@/components/dashboard/sections';
import { getConnectorLoad, getDashboardContext, getMonthBookings, getMyPlate } from '@/lib/dashboard/queries';
import { getChurchContext } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import { getPipeline, summarize } from '@/lib/connect/pipeline';
import { firstTimeHosts, openReportCount, regularsNotSeen } from '@/lib/connect/celebrate';
import { listHubEvents } from '@/lib/events/queries';
import { listGroups } from '@/lib/groups/queries';
import {
  AttentionBuckets,
  CelebrateAndReach,
  StagePills,
  WeekGatherings,
  WeekMeetings,
} from '@/components/connect/this-week';
import { clockInZone, yearMonthInZone } from '@/lib/time/zoned';

/**
 * This week: is our connect ministry on track? The admin's home and the
 * connector's. Every number comes from facts through ec_connect_pipeline,
 * the same rule the Monday digest and the contact nudges use.
 */

interface SearchParams {
  month?: string;
  scope?: 'all' | 'mine';
  view?: 'calendar' | 'list';
}

function parseMonth(value: string | undefined, timeZone: string): { year: number; month: number } {
  if (value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
    }
  }
  return yearMonthInZone(new Date(), timeZone);
}

function greeting(timeZone: string): string {
  const h = Number(clockInZone(new Date(), timeZone).slice(0, 2));
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireStaff();
  const churchId = session.profile?.church_id ?? null;
  const church = churchId ? await getChurchContext(churchId) : null;
  const churchTz = church?.timezone ?? 'America/Chicago';
  const params = await searchParams;
  const ctx = await getDashboardContext(session);

  const { year, month } = parseMonth(params.month, churchTz);
  const scope: 'all' | 'mine' =
    params.scope === 'all' || params.scope === 'mine' ? params.scope : ctx.isConnector ? 'mine' : 'all';
  const view: 'calendar' | 'list' = ctx.isConnector && params.view === 'list' ? 'list' : 'calendar';

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const rangeStart = view === 'list' ? new Date() : monthStart;
  const rangeEnd = view === 'list' ? addMonths(new Date(), 4) : monthEnd;
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 864e5);

  const [calendarEvents, weekMeetings, plate, connectorLoad, pipeline, weekGatherings, reported, hosts, missing, groups] =
    await Promise.all([
      getMonthBookings(ctx, rangeStart, rangeEnd, scope),
      getMonthBookings(ctx, now, weekEnd, ctx.isAdmin ? 'all' : 'mine'),
      ctx.isConnector ? getMyPlate(ctx) : Promise.resolve([]),
      ctx.isAdmin ? getConnectorLoad(ctx) : Promise.resolve([]),
      churchId
        ? getPipeline(churchId, !ctx.isAdmin && ctx.myConnectorId ? { connectorId: ctx.myConnectorId } : {})
        : Promise.resolve([]),
      churchId ? listHubEvents(churchId, { from: now.toISOString(), to: weekEnd.toISOString() }) : Promise.resolve([]),
      churchId && ctx.isAdmin ? openReportCount(churchId) : Promise.resolve(0),
      churchId && ctx.isAdmin ? firstTimeHosts(churchId) : Promise.resolve([]),
      churchId && ctx.isAdmin ? regularsNotSeen(churchId) : Promise.resolve([]),
      churchId && ctx.isAdmin ? listGroups(churchId) : Promise.resolve([]),
    ]);

  const summary = summarize(pipeline);
  const greetingName = ctx.session.profile?.first_name || ctx.session.email;
  const tableGroups = groups.filter((g) => g.kind !== 'roster' && !g.is_youth && g.is_active).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
            {church ? connectName(church) : 'This week'}
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
            {greeting(churchTz)}, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {ctx.isAdmin
              ? 'Who is new, who is waiting on someone, and what is happening this week.'
              : 'The people you are walking with, and your week.'}
          </p>
        </div>
        {ctx.isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link href="/participants/new">
              <Button size="md">
                <Plus className="h-4 w-4" />
                Add someone new
              </Button>
            </Link>
            <Link href="/groups/start-home-group">
              <Button size="md" variant="outline">
                Start a home group
              </Button>
            </Link>
          </div>
        )}
      </div>

      {churchId && (
        <section className="space-y-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            {ctx.isAdmin ? 'On track' : 'Your people'}
          </h2>
          <StagePills counts={summary.counts} newThisWeek={summary.newThisWeek} />
          <AttentionBuckets buckets={summary.buckets} groups={ctx.isAdmin ? tableGroups : []} canConfirm={ctx.isAdmin} />
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <WeekMeetings events={weekMeetings} timeZone={churchTz} />
        <WeekGatherings events={weekGatherings} reported={reported} />
      </section>

      {ctx.isAdmin && <CelebrateAndReach hosts={hosts} missing={missing} />}

      {ctx.isConnector && <Plate items={plate} timeZone={churchTz} />}

      {ctx.isAdmin && connectorLoad.length > 0 && <ConnectorLoad rows={connectorLoad} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">Meetings calendar</h2>
          {ctx.isConnector && (
            <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
              {(['calendar', 'list'] as const).map((v) => {
                const qs = new URLSearchParams();
                if (params.scope) qs.set('scope', params.scope);
                if (v === 'list') qs.set('view', 'list');
                const href = qs.toString() ? `/dashboard?${qs.toString()}` : '/dashboard';
                return (
                  <Link
                    key={v}
                    href={href}
                    className={cn(
                      'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                      view === v
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
                    )}
                  >
                    {v === 'calendar' ? 'Calendar' : 'List'}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {view === 'list' ? (
          <UpcomingAppointmentsList events={calendarEvents} timeZone={churchTz} />
        ) : (
          <MonthCalendar
            year={year}
            month={month}
            events={calendarEvents}
            baseHref="/dashboard"
            extraParams={{ scope: params.scope, view: params.view }}
            canToggleScope={ctx.isAdmin && ctx.isConnector}
            scope={scope}
            timeZone={churchTz}
          />
        )}
      </section>
    </div>
  );
}
