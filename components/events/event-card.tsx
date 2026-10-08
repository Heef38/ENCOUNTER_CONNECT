import Link from 'next/link';
import { CalendarDays, Lock, MapPin, Pin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ViewerEvent } from '@/lib/events/types';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';

/**
 * One event in the hub's list view.
 *
 * Renders only what `ViewerEvent` carries — the address-reveal decision was
 * already made in the query layer, so this component has no privacy logic and
 * cannot leak an address by getting a condition wrong.
 */

/** In the gathering's own timezone, never the server's. */
function formatWhen(e: ViewerEvent): string {
  const date = formatDateInZone(e.starts_at, e.timezone, { weekday: 'short', month: 'short', day: 'numeric' });
  if (e.all_day) return `${date} · all day`;
  return `${date} · ${formatTimeInZone(e.starts_at, e.timezone)}`;
}

export function EventCard({ event }: { event: ViewerEvent }) {
  const cancelled = event.status === 'cancelled';
  const accent = event.event_type?.color ?? 'var(--primary)';

  return (
    <article
      className={cn(
        'relative rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong',
        cancelled && 'opacity-70',
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {event.is_pinned && (
              <Badge tone="warning">
                <Pin className="mr-1 h-3 w-3" />
                Pinned
              </Badge>
            )}
            {event.event_type && (
              <span
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: accent }}
              >
                {event.event_type.name}
              </span>
            )}
            {event.visibility === 'private' && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle"
                title="Only the people it's for can see it"
              >
                <Lock className="h-3 w-3" />
                Private
              </span>
            )}
          </div>

          <h3
            className={cn(
              'mt-1.5 font-display text-lg font-medium tracking-tight text-foreground',
              cancelled && 'line-through',
            )}
          >
            <Link href={`/hub/e/${event.id}`} className="hover:text-primary">
              {event.title}
            </Link>
          </h3>

          {cancelled && (
            <p className="mt-1 text-sm font-medium text-danger">
              Cancelled
              {event.cancellation_reason ? ` — ${event.cancellation_reason}` : ''}
            </p>
          )}

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-muted">
            <div className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <dd>{formatWhen(event)}</dd>
            </div>

            {(event.location_label || event.address || event.address_hidden_pending_rsvp) && (
              <div className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <dd>
                  {event.address ??
                    event.location_label ??
                    (event.address_hidden_pending_rsvp ? 'Address shared once you RSVP' : '')}
                </dd>
              </div>
            )}

            {event.going_count > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <dd>{event.going_count} going</dd>
              </div>
            )}
          </dl>

          {event.description && (
            <p className="mt-2 line-clamp-2 text-sm text-foreground-muted">
              {event.description}
            </p>
          )}

          <p className="mt-2 text-xs text-foreground-subtle">
            Hosted by {event.host_name}
            {event.campus ? ` · ${event.campus.name}` : ''}
          </p>
        </div>

        {event.my_rsvp === 'going' && <Badge tone="success">You&apos;re going</Badge>}
        {event.my_rsvp === 'maybe' && <Badge tone="neutral">Maybe</Badge>}
      </div>
    </article>
  );
}
