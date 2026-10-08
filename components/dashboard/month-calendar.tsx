'use client';

import { useMemo } from 'react';
import {
  MonthCalendar as GenericMonthCalendar,
  type CalendarItem,
} from '@/components/calendar/month-calendar';
import type { CalendarEvent } from '@/lib/dashboard/queries';
import { colorForEvent } from '@/lib/dashboard/colors';

/**
 * Appointments calendar for /dashboard.
 *
 * The grid itself now lives in components/calendar/month-calendar.tsx so the
 * connection hub renders the same one. This file is the booking-shaped adapter:
 * it owns the CalendarEvent -> CalendarItem mapping, the appointment color
 * rules, participant deep-links, and the "appointment" wording. The props are
 * unchanged from before the extraction, so /dashboard needed no edits.
 */

interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
  baseHref: string;
  extraParams?: Record<string, string | undefined>;
  canToggleScope: boolean;
  scope: 'all' | 'mine';
}

export function MonthCalendar({
  year,
  month,
  events,
  baseHref,
  extraParams,
  canToggleScope,
  scope,
}: MonthCalendarProps) {
  const items = useMemo<CalendarItem[]>(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        color: colorForEvent(e),
        subtitle: e.participantName,
        subtitleHref: e.participantId ? `/participants/${e.participantId}` : null,
        location: e.location,
      })),
    [events],
  );

  return (
    <GenericMonthCalendar
      year={year}
      month={month}
      items={items}
      baseHref={baseHref}
      extraParams={extraParams}
      itemNoun={['appointment', 'appointments']}
      scopeToggle={
        canToggleScope
          ? {
              param: 'scope',
              value: scope,
              options: [
                { value: 'mine', label: 'Mine' },
                { value: 'all', label: 'All' },
              ],
            }
          : undefined
      }
    />
  );
}
