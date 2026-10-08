import { MonthCalendar, type CalendarItem } from '@/components/calendar/month-calendar';
import { EventCard } from '@/components/events/event-card';
import { HubFilters, type HubView as HubViewMode } from '@/components/events/hub-filters';
import type { EventType, ViewerEvent } from '@/lib/events/types';

/**
 * The hub's body: filter bar + either the month calendar or the list.
 *
 * Shared by the authenticated and anonymous paths — both hand it a
 * `ViewerEvent[]` that has already been through the address-reveal gate, so
 * neither can render more than its viewer is entitled to.
 */

interface HubViewProps {
  events: ViewerEvent[];
  eventTypes: EventType[];
  myGroups: Array<{ id: string; name: string }>;
  campuses: Array<{ id: string; name: string }>;
  view: HubViewMode;
  month: { year: number; month: number };
  active: { type?: string; group?: string; campus?: string; month?: string };
  emptyMessage: string;
}

function toCalendarItems(events: ViewerEvent[]): CalendarItem[] {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    color: e.event_type?.color ?? '#0f766e',
    href: `/hub/e/${e.id}`,
    subtitle: e.event_type?.name ?? null,
    location: e.address ?? e.location_label,
    badge: e.is_pinned ? 'Pinned' : e.status === 'cancelled' ? 'Cancelled' : null,
  }));
}

export function HubView({
  events,
  eventTypes,
  myGroups,
  campuses,
  view,
  month,
  active,
  emptyMessage,
}: HubViewProps) {
  const pinned = events.filter((e) => e.is_pinned);

  return (
    <div className="space-y-6">
      <HubFilters
        view={view}
        eventTypes={eventTypes}
        myGroups={myGroups}
        campuses={campuses}
        active={active}
      />

      {/* Pinned strip. Pinning is an admin act and never changes visibility —
          a pinned private event still only reaches its audience. */}
      {pinned.length > 0 && view === 'list' && (
        <section>
          <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            Pinned by your church
          </h2>
          <div className="space-y-3">
            {pinned.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {view === 'calendar' ? (
        <MonthCalendar
          year={month.year}
          month={month.month}
          items={toCalendarItems(events)}
          baseHref="/"
          extraParams={{
            view: 'calendar',
            type: active.type,
            group: active.group,
            campus: active.campus,
          }}
          itemNoun={['event', 'events']}
        />
      ) : (
        <section className="space-y-3">
          {pinned.length > 0 && (
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
              Upcoming
            </h2>
          )}
          {events.filter((e) => !e.is_pinned).length === 0 && pinned.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-muted">
              {emptyMessage}
            </p>
          ) : (
            events
              .filter((e) => !e.is_pinned)
              .map((e) => <EventCard key={e.id} event={e} />)
          )}
        </section>
      )}
    </div>
  );
}
