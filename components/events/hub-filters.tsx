import Link from 'next/link';
import { CalendarDays, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventType } from '@/lib/events/types';

/**
 * Hub filter bar. URL-as-state throughout — every control is a Link that
 * rewrites query params, matching the participants-list pattern, so the whole
 * hub stays a server component and filters survive refresh and sharing.
 */

export type HubView = 'calendar' | 'list';

interface HubFiltersProps {
  view: HubView;
  eventTypes: EventType[];
  myGroups: Array<{ id: string; name: string }>;
  campuses: Array<{ id: string; name: string }>;
  active: {
    type?: string;
    group?: string;
    campus?: string;
    month?: string;
  };
}

function withParams(
  active: HubFiltersProps['active'],
  view: HubView,
  overrides: Record<string, string | undefined>,
): string {
  const params: Record<string, string | undefined> = {
    view,
    type: active.type,
    group: active.group,
    campus: active.campus,
    month: active.month,
    ...overrides,
  };
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return entries.length > 0
    ? `/?${new URLSearchParams(entries as [string, string][]).toString()}`
    : '/';
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-foreground-muted hover:border-border-strong hover:text-foreground',
      )}
    >
      {children}
    </Link>
  );
}

export function HubFilters({
  view,
  eventTypes,
  myGroups,
  campuses,
  active,
}: HubFiltersProps) {
  return (
    <div className="space-y-3">
      {/* View switch */}
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 w-fit">
        {(
          [
            ['calendar', 'Calendar', CalendarDays],
            ['list', 'List', List],
          ] as const
        ).map(([key, label, Icon]) => (
          <Link
            key={key}
            href={withParams(active, key, {})}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
              view === key
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
        {/* Map view lands in phase 4 — the schema already carries lat/lng. */}
      </div>

      {/* Type filter */}
      {eventTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            Type
          </span>
          <Chip href={withParams(active, view, { type: undefined })} active={!active.type}>
            All
          </Chip>
          {eventTypes.map((t) => (
            <Chip
              key={t.id}
              href={withParams(active, view, { type: t.id })}
              active={active.type === t.id}
            >
              {t.name}
            </Chip>
          ))}
        </div>
      )}

      {/* Group filter — only the viewer's own groups, so this control can't be
          used to discover groups they aren't in. */}
      {myGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            My groups
          </span>
          <Chip href={withParams(active, view, { group: undefined })} active={!active.group}>
            All
          </Chip>
          {myGroups.map((g) => (
            <Chip
              key={g.id}
              href={withParams(active, view, { group: g.id })}
              active={active.group === g.id}
            >
              {g.name}
            </Chip>
          ))}
        </div>
      )}

      {campuses.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
            Campus
          </span>
          <Chip href={withParams(active, view, { campus: undefined })} active={!active.campus}>
            All
          </Chip>
          {campuses.map((c) => (
            <Chip
              key={c.id}
              href={withParams(active, view, { campus: c.id })}
              active={active.campus === c.id}
            >
              {c.name}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
