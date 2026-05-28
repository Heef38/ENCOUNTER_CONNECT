'use client';

import { useState, useTransition } from 'react';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfToday,
  format,
  isBefore,
  isAfter,
  isSameMonth,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveMyAvailability, type DateWindow } from '@/lib/connectors/availability-actions';

const MONTHS_AHEAD = 3;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function key(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function ConnectorAvailabilityEditor({
  initialWindows,
  timezone,
}: {
  initialWindows: DateWindow[];
  timezone: string;
}) {
  const today = startOfToday();
  const firstMonth = startOfMonth(today);
  const lastMonth = startOfMonth(addMonths(today, MONTHS_AHEAD));
  const horizon = addMonths(today, MONTHS_AHEAD);

  const [month, setMonth] = useState<Date>(firstMonth);
  const [selected, setSelected] = useState<Map<string, { start: string; end: string }>>(
    () => new Map(initialWindows.map((w) => [w.date, { start: w.start_time, end: w.end_time }])),
  );
  const [defStart, setDefStart] = useState('09:00');
  const [defEnd, setDefEnd] = useState('17:00');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const gridDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  function inRange(d: Date) {
    return !isBefore(d, today) && !isAfter(d, horizon);
  }

  function toggle(d: Date) {
    if (!inRange(d)) return;
    setSaved(false);
    const k = key(d);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, { start: defStart, end: defEnd });
      return next;
    });
  }

  function editTime(k: string, patch: Partial<{ start: string; end: string }>) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Map(prev);
      const cur = next.get(k);
      if (cur) next.set(k, { ...cur, ...patch });
      return next;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    const windows: DateWindow[] = Array.from(selected.entries())
      .map(([date, t]) => ({ date, start_time: t.start, end_time: t.end }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    start(async () => {
      const res = await saveMyAvailability(windows);
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      setSaved(true);
    });
  }

  const selectedList = Array.from(selected.entries()).sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <div className="space-y-5">
      {/* Default hours for newly tapped days */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-sm">
        <span className="text-foreground-muted">New days use</span>
        <Input type="time" value={defStart} onChange={(e) => setDefStart(e.target.value)} className="w-28" />
        <span className="text-foreground-subtle">to</span>
        <Input type="time" value={defEnd} onChange={(e) => setDefEnd(e.target.value)} className="w-28" />
      </div>

      {/* Month calendar */}
      <div className="rounded-lg border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            disabled={!isAfter(month, firstMonth)}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-display text-base font-semibold text-foreground">
            {format(month, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={!isBefore(month, lastMonth)}
            className="rounded p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 text-xs font-medium text-foreground-subtle">{w}</div>
          ))}
          {gridDays.map((d) => {
            const k = key(d);
            const isSelected = selected.has(k);
            const enabled = inRange(d) && isSameMonth(d, month);
            const dim = !isSameMonth(d, month);
            return (
              <button
                key={k}
                type="button"
                disabled={!enabled}
                onClick={() => toggle(d)}
                className={`aspect-square rounded-md text-sm transition ${
                  isSelected
                    ? 'bg-primary font-semibold text-white'
                    : enabled
                    ? 'hover:bg-primary/10 text-foreground'
                    : 'text-foreground-subtle/40'
                } ${dim ? 'opacity-40' : ''} disabled:cursor-default`}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected dates with editable times */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Available days ({selectedList.length})
        </p>
        {selectedList.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            Tap days on the calendar to mark when you&apos;re available.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {selectedList.map(([k, t]) => (
              <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-40 flex-none font-medium text-foreground">
                  {format(new Date(`${k}T00:00:00`), 'EEE, MMM d')}
                </span>
                <Input type="time" value={t.start} onChange={(e) => editTime(k, { start: e.target.value })} className="w-28" />
                <span className="text-foreground-subtle">to</span>
                <Input type="time" value={t.end} onChange={(e) => editTime(k, { end: e.target.value })} className="w-28" />
                <button
                  type="button"
                  onClick={() => toggle(new Date(`${k}T00:00:00`))}
                  aria-label="Remove day"
                  className="ml-auto rounded p-1 text-foreground-subtle hover:bg-danger-bg hover:text-danger"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-foreground-subtle">
        Times are in your church&apos;s timezone ({timezone}). You can schedule up to{' '}
        {MONTHS_AHEAD} months ahead.
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Availability saved.</p>}

      <Button onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save availability'}
      </Button>
    </div>
  );
}
