'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/lib/dashboard/queries';
import { colorForEvent } from '@/lib/dashboard/colors';

interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
  baseHref: string;
  extraParams?: Record<string, string | undefined>;
  canToggleScope: boolean;
  scope: 'all' | 'mine';
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const VISIBLE_SLOTS = 4;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function monthParam(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

function buildHref(
  base: string,
  params: Record<string, string | undefined>,
): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return base;
  return `${base}?${new URLSearchParams(entries as [string, string][]).toString()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function MonthCalendar({
  year,
  month,
  events,
  baseHref,
  extraParams = {},
  canToggleScope,
  scope,
}: MonthCalendarProps) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [morePos, setMorePos] = useState<{ top: number; left: number } | null>(null);

  const { weeks, prevHref, nextHref, todayKey } = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ key: string; date: Date | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ key: `pad-${i}`, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        key: `${year}-${pad2(month)}-${pad2(d)}`,
        date: new Date(year, month - 1, d),
      });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `pad-end-${cells.length}`, date: null });
    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

    const prev = new Date(year, month - 2, 1);
    const next = new Date(year, month, 1);
    const today = new Date();
    const tk = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

    return {
      weeks: rows,
      prevHref: buildHref(baseHref, {
        ...extraParams,
        month: monthParam(prev.getFullYear(), prev.getMonth() + 1),
      }),
      nextHref: buildHref(baseHref, {
        ...extraParams,
        month: monthParam(next.getFullYear(), next.getMonth() + 1),
      }),
      todayKey: tk,
    };
  }, [year, month, baseHref, extraParams]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.starts_at);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return map;
  }, [events]);

  // Close MORE popover on outside click / Escape.
  useEffect(() => {
    if (!moreFor) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-more-popover]') || target.closest('[data-more-trigger]')) return;
      setMoreFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreFor(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreFor]);

  const openEvents = openDay ? eventsByDay.get(openDay) ?? [] : [];
  const openDate = openDay ? new Date(`${openDay}T00:00:00`) : null;
  const moreEvents = moreFor ? (eventsByDay.get(moreFor) ?? []).slice(VISIBLE_SLOTS - 1) : [];

  return (
    <section className="rounded-lg border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <Link href={prevHref} aria-label="Previous month">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h2 className="font-display text-base font-medium tracking-tight text-foreground">
            {MONTH_LABELS[month - 1]} {year}
          </h2>
          <Link href={nextHref} aria-label="Next month">
            <Button variant="ghost" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {canToggleScope && (
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            {(['mine', 'all'] as const).map((s) => {
              const active = scope === s;
              const href = buildHref(baseHref, {
                ...extraParams,
                month: monthParam(year, month),
                scope: s,
              });
              return (
                <Link
                  key={s}
                  href={href}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
                  )}
                >
                  {s === 'mine' ? 'Mine' : 'All'}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <div className="grid grid-cols-7 border-b border-border bg-surface-muted/40 text-center text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
        {DOW.map((d, i) => (
          <div key={`${d}-${i}`} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          if (!cell.date) {
            return (
              <div
                key={cell.key}
                className="h-24 border-b border-r border-border bg-surface-muted/20 last:border-r-0"
              />
            );
          }
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const overflow = dayEvents.length > VISIBLE_SLOTS;
          const visibleCount = overflow ? VISIBLE_SLOTS - 1 : dayEvents.length;
          const visibleEvents = dayEvents.slice(0, visibleCount);
          const isEmpty = dayEvents.length === 0;

          return (
            <div
              key={cell.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpenDay(cell.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenDay(cell.key);
                }
              }}
              className={cn(
                'group relative flex h-24 cursor-pointer flex-col border-b border-r border-border outline-none transition-colors hover:bg-surface-muted/40 focus-visible:bg-surface-muted/40',
                'last:[&:nth-child(7n)]:border-r-0',
              )}
            >
              {isEmpty ? (
                <EmptyDay date={cell.date.getDate()} isToday={isToday} />
              ) : (
                <FilledDay
                  date={cell.date.getDate()}
                  isToday={isToday}
                  visible={visibleEvents}
                  overflow={overflow}
                  overflowCount={dayEvents.length - (VISIBLE_SLOTS - 1)}
                  onMore={(rect) => {
                    setMoreFor(cell.key);
                    setMorePos({
                      top: rect.bottom + window.scrollY + 4,
                      left: rect.left + window.scrollX,
                    });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Sheet
        open={openDay !== null}
        onClose={() => setOpenDay(null)}
        side="right"
        label="Day detail"
        className="w-96"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h3 className="font-display text-lg font-medium text-foreground">
              {openDate?.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            <p className="text-xs text-foreground-muted">
              {openEvents.length} {openEvents.length === 1 ? 'appointment' : 'appointments'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpenDay(null)}>
            Close
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          {openEvents.length === 0 ? (
            <p className="text-sm text-foreground-muted">No appointments scheduled.</p>
          ) : (
            <ul className="space-y-3">
              {openEvents.map((e) => (
                <li
                  key={e.id}
                  className="rounded-md border border-border p-3"
                  style={{ borderLeft: `3px solid ${colorForEvent(e)}` }}
                >
                  <div className="text-xs text-foreground-muted">
                    {formatTime(e.starts_at)} – {formatTime(e.ends_at)}
                  </div>
                  <div className="mt-1 font-medium text-foreground">{e.title}</div>
                  {e.participantName && (
                    <div className="mt-1 text-sm text-foreground-muted">
                      {e.participantId ? (
                        <Link
                          href={`/participants/${e.participantId}`}
                          className="hover:text-primary"
                        >
                          {e.participantName}
                        </Link>
                      ) : (
                        e.participantName
                      )}
                    </div>
                  )}
                  {e.location && (
                    <div className="text-xs text-foreground-subtle">{e.location}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {moreFor && morePos && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-more-popover
              style={{
                position: 'absolute',
                top: morePos.top,
                left: morePos.left,
                minWidth: 240,
              }}
              className="z-50 rounded-md border border-border bg-surface p-2 shadow-xl"
            >
              <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
                Also on this day
              </div>
              <ul className="space-y-1">
                {moreEvents.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenDay(moreFor);
                        setMoreFor(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-muted"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: colorForEvent(e) }}
                      />
                      <span className="shrink-0 text-foreground-subtle">{formatTime(e.starts_at)}</span>
                      <span className="truncate text-foreground">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function EmptyDay({ date, isToday }: { date: number; isToday: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-start gap-0.5 px-1.5 py-1">
      <DayNumber n={date} isToday={isToday} />
      <span className="select-none text-[10px] leading-none tracking-widest text-foreground-subtle/60">
        • • •
      </span>
    </div>
  );
}

function FilledDay({
  date,
  isToday,
  visible,
  overflow,
  overflowCount,
  onMore,
}: {
  date: number;
  isToday: boolean;
  visible: CalendarEvent[];
  overflow: boolean;
  overflowCount: number;
  onMore: (rect: DOMRect) => void;
}) {
  const moreRef = useRef<HTMLButtonElement | null>(null);
  // 1 slot beside the number + (VISIBLE_SLOTS - 1) below.
  const slotsBelow = VISIBLE_SLOTS - 1;

  return (
    <div className="flex flex-1 flex-col px-1.5 pt-1 pb-0.5">
      {/* Header row: number + first appointment line */}
      <div className="flex items-center gap-1.5 border-b border-border/60 pb-0.5">
        <DayNumber n={date} isToday={isToday} />
        <div className="min-w-0 flex-1">
          {visible[0] ? <EventLine event={visible[0]} /> : null}
        </div>
      </div>
      {/* 5 ruled lines beneath */}
      {Array.from({ length: slotsBelow }).map((_, i) => {
        const idx = i + 1;
        const isLastSlot = i === slotsBelow - 1;
        const evt = visible[idx];
        if (isLastSlot && overflow) {
          return (
            <button
              key="more"
              ref={moreRef}
              type="button"
              data-more-trigger
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onMore(rect);
              }}
              className="flex items-center justify-center gap-1 border-b border-border/60 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/5"
            >
              MORE <ChevronDown className="h-3 w-3" />
              <span className="ml-1 text-foreground-subtle normal-case tracking-normal">
                +{overflowCount}
              </span>
            </button>
          );
        }
        return (
          <div key={i} className="border-b border-border/60 py-0.5">
            {evt ? <EventLine event={evt} /> : <span className="invisible text-xs">.</span>}
          </div>
        );
      })}
    </div>
  );
}

function DayNumber({ n, isToday }: { n: number; isToday: boolean }) {
  return (
    <span
      className={cn(
        'font-sans text-sm font-bold leading-none tabular-nums',
        isToday
          ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs'
          : 'text-foreground',
      )}
    >
      {n}
    </span>
  );
}

function EventLine({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] leading-tight">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: colorForEvent(event) }}
      />
      <span className="shrink-0 text-foreground-subtle tabular-nums">
        {formatTime(event.starts_at)}
      </span>
      <span className="truncate text-foreground">{event.title}</span>
    </div>
  );
}
