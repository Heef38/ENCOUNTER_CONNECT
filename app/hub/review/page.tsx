import Link from 'next/link';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { listReviewQueue } from '@/lib/events/review';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ReviewActions } from './review-actions';

const REASON: Record<string, string> = {
  not_legitimate: "Doesn't look real",
  inappropriate: "Not appropriate for our church",
  wrong_details: 'Details wrong or out of date',
  safety_concern: 'Safety concern',
  spam: 'Spam',
  other: 'Something else',
};

/** Each church reviews its own reported and hidden gatherings. */
export default async function ReviewPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">No church context.</p>;
  const items = await listReviewQueue(churchId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Reported gatherings</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          A report from someone connected at your church takes a gathering off the hub until you look. Reports from anyone else
          land here without pulling it.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-muted">
          Nothing to review.
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map(({ event, reports }) => (
            <li key={event.id}>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {event.status === 'hidden' ? <Badge tone="danger">Off the hub</Badge> : <Badge tone="neutral">{event.status}</Badge>}
                    <span className="text-xs text-foreground-subtle">
                      {event.visibility} · {event.venue_kind.replace('_', ' ')}
                    </span>
                    {event.host_blocked && <Badge tone="warning">Host blocked</Badge>}
                  </div>
                  <div>
                    <Link href={`/hub/e/${event.id}`} className="font-display text-lg font-medium text-foreground hover:text-primary">
                      {event.title}
                    </Link>
                    <p className="text-sm text-foreground-muted">
                      Hosted by {event.host_name} · {formatDateInZone(event.starts_at, event.timezone, { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                      {formatTimeInZone(event.starts_at, event.timezone)}
                    </p>
                  </div>
                  {reports.length > 0 && (
                    <ul className="space-y-1.5 rounded-md bg-surface-muted/40 p-3 text-sm">
                      {reports.map((r) => (
                        <li key={r.id}>
                          <span className="font-medium text-foreground">{REASON[r.reason] ?? r.reason}</span>
                          <span className="text-foreground-muted">
                            {' '}
                            · {r.reporter_name}
                            {r.reporter_from_this_church ? '' : ' (not connected here)'}
                          </span>
                          {r.note && <p className="mt-0.5 text-foreground-muted">“{r.note}”</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ReviewActions eventId={event.id} hidden={event.status === 'hidden'} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
