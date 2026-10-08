import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Lock, MapPin, Pin, Users } from 'lucide-react';
import { getEvent } from '@/lib/events/queries';
import { getSession } from '@/lib/auth/dal';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RsvpControls } from './rsvp-controls';
import { ReportEventButton } from './report-event-button';
import { HostActions } from './host-actions';

/**
 * Event detail.
 *
 * `getEvent` returns null when the viewer isn't entitled to the event — RLS
 * makes the row simply not exist for them, so this 404s rather than 403s and
 * doesn't confirm that a private event exists.
 */
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [event, session] = await Promise.all([getEvent(id), getSession()]);

  if (!event) notFound();

  const start = new Date(event.starts_at);
  const end = new Date(event.ends_at);
  const cancelled = event.status === 'cancelled';

  return (
    <article className="space-y-6">
      <Link href="/" className="text-sm text-foreground-muted hover:text-primary">
        ← Back to the hub
      </Link>

      <header>
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
              style={{ color: event.event_type.color ?? 'var(--primary)' }}
            >
              {event.event_type.name}
            </span>
          )}
          {event.visibility === 'private' ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
              <Lock className="h-3 w-3" />
              Only for this event&apos;s groups
            </span>
          ) : (
            <span className="text-[11px] text-foreground-subtle">
              Open to everyone
            </span>
          )}
        </div>

        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {event.title}
        </h1>

        <p className="mt-1 text-sm text-foreground-muted">
          Hosted by {event.host_name}
          {event.campus ? ` · ${event.campus.name}` : ''}
        </p>
      </header>

      {cancelled && (
        <div className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          <strong className="font-semibold">This event was cancelled.</strong>
          {event.cancellation_reason ? ` ${event.cancellation_reason}` : ''}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-5 text-sm">
          <div className="flex items-start gap-2.5">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
            <div>
              <div className="font-medium text-foreground">
                {start.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </div>
              <div className="text-foreground-muted">
                {event.all_day
                  ? 'All day'
                  : `${start.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })} – ${end.toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}`}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
            <div>
              {event.location_label && (
                <div className="font-medium text-foreground">{event.location_label}</div>
              )}
              {/* The reveal decision was made in the query layer — this just
                  renders whichever of the two shapes came back. */}
              {event.address ? (
                <div className="text-foreground-muted">{event.address}</div>
              ) : event.address_hidden_pending_rsvp ? (
                <div className="text-foreground-muted">
                  The host shares the address once you RSVP.
                </div>
              ) : null}
            </div>
          </div>

          {(event.going_count > 0 || event.capacity) && (
            <div className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
              <div className="text-foreground-muted">
                {event.going_count} going
                {event.capacity ? ` · room for ${event.capacity}` : ''}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {event.description && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {event.description}
        </div>
      )}

      {/* Actions */}
      {session ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {event.can_rsvp && !cancelled && (
            <RsvpControls eventId={event.id} current={event.my_rsvp} />
          )}
          {event.can_edit && (
            <HostActions eventId={event.id} cancelled={cancelled} />
          )}
          {event.can_report && <ReportEventButton eventId={event.id} />}
        </div>
      ) : (
        <div className="border-t border-border pt-5">
          <p className="text-sm text-foreground-muted">
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>{' '}
            or{' '}
            <Link href="/" className="font-medium text-primary hover:underline">
              sign in
            </Link>{' '}
            to RSVP and reach the host.
          </p>
        </div>
      )}
    </article>
  );
}
