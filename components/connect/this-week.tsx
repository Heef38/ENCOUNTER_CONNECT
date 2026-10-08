import Link from 'next/link';
import { CalendarDays, HeartHandshake, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { FLAGS, STAGES, type Flag, type PipelineRow, type Stage } from '@/lib/connect/pipeline';
import type { PersonMoment } from '@/lib/connect/celebrate';
import type { CalendarEvent } from '@/lib/dashboard/queries';
import type { ViewerEvent } from '@/lib/events/types';
import { formatShortDateTimeInZone } from '@/lib/time/zoned';
import { IntroduceToGroup } from './introduce-to-group';

/**
 * The panes of the This week console. Server components: they render what
 * the console page already loaded and decided.
 */

export function StagePills({ counts, newThisWeek }: { counts: Record<Stage, number>; newThisWeek: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Card>
        <CardContent className="p-4">
          <div className="text-2xl font-semibold tabular-nums text-foreground">{newThisWeek}</div>
          <div className="text-xs text-foreground-muted">New this week</div>
        </CardContent>
      </Card>
      {STAGES.filter((s) => s.key !== 'inactive').map((s) => (
        <Link key={s.key} href={`/participants?stage=${s.key}`}>
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="p-4">
              <div className="text-2xl font-semibold tabular-nums text-foreground">{counts[s.key] ?? 0}</div>
              <div className="text-xs text-foreground-muted" title={s.hint}>
                {s.label}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

const BUCKET_COPY: Record<Flag, string> = {
  needs_contact: 'Signed up and nobody has reached out yet.',
  unassigned: 'No connector yet.',
  stalled: 'Contacted or met, then quiet for two weeks.',
  needs_table: 'Not in a group or at a gathering yet.',
};

export function AttentionBuckets({
  buckets,
  groups,
}: {
  buckets: Record<Flag, PipelineRow[]>;
  groups: Array<{ id: string; name: string }>;
}) {
  const order: Flag[] = ['needs_contact', 'unassigned', 'stalled', 'needs_table'];
  const empty = order.every((f) => buckets[f].length === 0);
  if (empty) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-foreground-muted">
          Nobody is waiting on you right now. Everyone new has been reached, has a connector, and is moving.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {order.map((flag) =>
        buckets[flag].length === 0 ? null : (
          <Card key={flag}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={FLAGS[flag].tone}>{FLAGS[flag].label}</Badge>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{buckets[flag].length}</span>
                </div>
                <Link href={`/participants?flag=${flag}`} className="text-xs font-medium text-primary hover:underline">
                  See all
                </Link>
              </div>
              <p className="text-xs text-foreground-muted">{BUCKET_COPY[flag]}</p>
              <ul className="space-y-1 text-sm">
                {buckets[flag].slice(0, 5).map((p) => (
                  <li key={p.participant_id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/participants/${p.participant_id}`} className="font-medium text-foreground hover:text-primary">
                      {p.first_name} {p.last_name}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-foreground-subtle">
                      {p.days_since_signup}d since signup
                      {p.connector_name ? ` · ${p.connector_name}` : ''}
                      {flag === 'needs_table' && p.profile_id && groups.length > 0 && (
                        <IntroduceToGroup participantId={p.participant_id} groups={groups} />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}

export function WeekMeetings({ events, timeZone }: { events: CalendarEvent[]; timeZone: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4" />
          First meetings this week
        </h3>
        {events.length === 0 ? (
          <p className="text-sm text-foreground-muted">None booked.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {events.slice(0, 10).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="text-foreground">
                  {e.participantId ? (
                    <Link href={`/participants/${e.participantId}`} className="hover:text-primary">
                      {e.participantName ?? e.title}
                    </Link>
                  ) : (
                    e.participantName ?? e.title
                  )}
                </span>
                <span className="text-xs text-foreground-subtle">{formatShortDateTimeInZone(e.starts_at, timeZone)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function WeekGatherings({ events, reported }: { events: ViewerEvent[]; reported: number }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="h-4 w-4" />
            Gatherings this week
          </h3>
          {reported > 0 && (
            <Link href="/hub/review">
              <Badge tone="danger">{reported} reported</Badge>
            </Link>
          )}
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nothing on the calendar. Home groups and get-togethers members host show up here.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {events.slice(0, 10).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <Link href={`/hub/e/${e.id}`} className="text-foreground hover:text-primary">
                  {e.status === 'cancelled' ? <s>{e.title}</s> : e.title}
                </Link>
                <span className="flex items-center gap-1 text-xs text-foreground-subtle">
                  <Users className="h-3 w-3" />
                  {e.going_count} · {formatShortDateTimeInZone(e.starts_at, e.timezone)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CelebrateAndReach({ hosts, missing }: { hosts: PersonMoment[]; missing: PersonMoment[] }) {
  if (hosts.length === 0 && missing.length === 0) return null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <HeartHandshake className="h-4 w-4" />
            Celebrate
          </h3>
          {hosts.length === 0 ? (
            <p className="text-sm text-foreground-muted">No first-time hosts this month yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {hosts.map((h) => (
                <li key={h.profile_id}>
                  <span className="font-medium text-foreground">{h.name}</span>{' '}
                  {h.href ? (
                    <Link href={h.href} className="text-foreground-muted hover:text-primary">
                      {h.detail}
                    </Link>
                  ) : (
                    <span className="text-foreground-muted">{h.detail}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold text-foreground">Reach out</h3>
          {missing.length === 0 ? (
            <p className="text-sm text-foreground-muted">Your regulars are still coming.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {missing.map((m) => (
                <li key={m.profile_id} className="flex justify-between gap-2">
                  <span className="text-foreground">{m.name}</span>
                  <span className="text-xs text-foreground-subtle">{m.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
