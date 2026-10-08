import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, CalendarPlus, Lock, MapPin, Pin, Users } from 'lucide-react';
import { countFutureInSeries, getEvent, listEventAttendees } from '@/lib/events/queries';
import { getSession } from '@/lib/auth/dal';
import { getChurchContext } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import { formatDateInZone, formatTimeInZone, zoneAbbreviation } from '@/lib/time/zoned';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RsvpControls } from './rsvp-controls';
import { ReportEventButton } from './report-event-button';
import { HostActions } from './host-actions';
import { AttendeeList } from './attendee-list';
import { MessageHostButton } from './message-host-button';

/**
 * Gathering detail.
 *
 * getEvent returns null when the viewer isn't entitled to it — RLS makes the
 * row simply not exist for them, so this 404s rather than 403s and doesn't
 * confirm that a private gathering exists. Signed-out visitors reach public
 * gatherings only (proxy allows /hub/e/; the query filters to public).
 */

function hasStarted(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: 'Gathering', robots: { index: false } };
  const church = await getChurchContext(event.church_id);
  const when = `${formatDateInZone(event.starts_at, event.timezone)} at ${formatTimeInZone(event.starts_at, event.timezone)}`;
  // Homes and cancelled gatherings never go to search engines, and private
  // gatherings are invisible to them anyway.
  const indexable = event.visibility === 'public' && event.venue_kind !== 'home' && event.status === 'published';
  return {
    title: `${event.title} · ${connectName(church)}`,
    description: `${when}${event.location_label ? ` · ${event.location_label}` : ''}`,
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, session] = await Promise.all([getEvent(id), getSession()]);
  if (!event) notFound();

  const [attendees, futureInSeries] = await Promise.all([
    session ? listEventAttendees(event.id) : Promise.resolve([]),
    event.series_id ? countFutureInSeries(event.series_id, event.starts_at) : Promise.resolve(1),
  ]);

  const tz = event.timezone;
  const cancelled = event.status === 'cancelled';
  const draft = event.status === 'draft';
  const hidden = event.status === 'hidden';
  const started = hasStarted(event.starts_at);

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
          {draft && <Badge tone="neutral">Draft · only you can see this</Badge>}
          {hidden && <Badge tone="danger">Off the hub while an admin reviews a report</Badge>}
          {event.event_type && (
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: event.event_type.color ?? 'var(--primary)' }}>
              {event.event_type.name}
            </span>
          )}
          {event.visibility === 'private' ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground-subtle">
              <Lock className="h-3 w-3" />
              Private
            </span>
          ) : (
            <span className="text-[11px] text-foreground-subtle">Open to everyone</span>
          )}
        </div>

        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">{event.title}</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Hosted by {event.host_name}
          {event.campus ? ` · ${event.campus.name}` : ''}
        </p>
      </header>

      {cancelled && (
        <div className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          <strong className="font-semibold">This gathering was cancelled.</strong>
          {event.cancellation_reason ? ` ${event.cancellation_reason}` : ''}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-5 text-sm">
          <div className="flex items-start gap-2.5">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
            <div>
              <div className="font-medium text-foreground">{formatDateInZone(event.starts_at, tz)}</div>
              <div className="text-foreground-muted">
                {event.all_day
                  ? 'All day'
                  : `${formatTimeInZone(event.starts_at, tz)} – ${formatTimeInZone(event.ends_at, tz)} ${zoneAbbreviation(event.starts_at, tz)}`}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
            <div>
              {event.location_label && <div className="font-medium text-foreground">{event.location_label}</div>}
              {/* The database withheld or released the address; this renders whichever came back. */}
              {event.address ? (
                <div className="text-foreground-muted">{event.address}</div>
              ) : event.address_hidden_pending_rsvp ? (
                <div className="text-foreground-muted">
                  {session ? 'The address is shared once you say you’re going.' : 'Sign in and say you’re going to get the address.'}
                </div>
              ) : null}
              {event.address && event.exact_lat !== null && event.exact_lng !== null && (
                <a
                  className="text-xs font-medium text-primary hover:underline"
                  href={`https://www.openstreetmap.org/?mlat=${event.exact_lat}&mlon=${event.exact_lng}#map=17/${event.exact_lat}/${event.exact_lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in a map
                </a>
              )}
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

          {!cancelled && !draft && (
            <div className="flex items-start gap-2.5">
              <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
              <a href={`/hub/e/${event.id}/ics`} className="text-sm font-medium text-primary hover:underline">
                Add to my calendar
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {event.description && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{event.description}</div>
      )}

      {session && attendees.length > 0 && (
        <AttendeeList eventId={event.id} attendees={attendees} canCheckIn={event.can_check_in} started={started} />
      )}

      {session ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          {event.can_rsvp && !cancelled && !event.is_host && (
            <RsvpControls
              eventId={event.id}
              current={event.my_rsvp}
              currentGuests={event.my_guest_count}
              isPrivateHome={event.venue_kind === 'home' && event.visibility === 'private'}
            />
          )}
          <HostActions
            eventId={event.id}
            status={event.status}
            canEdit={event.can_edit}
            canPin={event.can_pin}
            isPinned={event.is_pinned}
            futureInSeries={futureInSeries}
          />
          {event.can_message_host && !cancelled && <MessageHostButton eventId={event.id} hostName={event.host_name} />}
          {event.can_report && <ReportEventButton eventId={event.id} />}
        </div>
      ) : (
        <div className="border-t border-border pt-5">
          <p className="text-sm text-foreground-muted">
            Going?{' '}
            <Link href={`/?next=${encodeURIComponent(`/hub/e/${event.id}`)}`} className="font-medium text-primary hover:underline">
              Sign in
            </Link>{' '}
            or{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              create an account
            </Link>{' '}
            to RSVP and message the host.
          </p>
        </div>
      )}
    </article>
  );
}
