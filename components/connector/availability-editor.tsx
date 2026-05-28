'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveMyAvailability, type DayWindow } from '@/lib/connectors/availability-actions';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

export function ConnectorAvailabilityEditor({
  initialWindows,
  timezone,
}: {
  initialWindows: DayWindow[];
  timezone: string;
}) {
  const byDay = new Map(initialWindows.map((w) => [w.day_of_week, w]));
  const [days, setDays] = useState<DayState[]>(
    DAYS.map((_, i) => {
      const w = byDay.get(i);
      return {
        enabled: Boolean(w),
        start: w?.start_time ?? '09:00',
        end: w?.end_time ?? '17:00',
      };
    }),
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<DayState>) {
    setSaved(false);
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function save() {
    setError(null);
    setSaved(false);
    const windows: DayWindow[] = days
      .map((d, i) => ({ enabled: d.enabled, day_of_week: i, start_time: d.start, end_time: d.end }))
      .filter((d) => d.enabled)
      .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }));

    start(async () => {
      const res = await saveMyAvailability(windows);
      if (!res.ok) {
        setError(res.error ?? 'Could not save.');
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {days.map((d, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <label className="flex w-32 flex-none items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              {DAYS[i]}
            </label>
            {d.enabled ? (
              <div className="flex items-center gap-2 text-sm">
                <Input
                  type="time"
                  value={d.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                  className="w-32"
                />
                <span className="text-foreground-subtle">to</span>
                <Input
                  type="time"
                  value={d.end}
                  onChange={(e) => update(i, { end: e.target.value })}
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-sm text-foreground-subtle">Unavailable</span>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-foreground-subtle">
        Times are in your church&apos;s timezone ({timezone}).
      </p>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-success">Availability saved.</p>}

      <Button onClick={save} disabled={pending}>
        {pending ? 'Saving…' : 'Save availability'}
      </Button>
    </div>
  );
}
