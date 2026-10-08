'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setAttendance } from '@/lib/events/actions';
import type { EventAttendee } from '@/lib/events/types';

const LABEL: Record<string, string> = { going: 'Going', maybe: 'Maybe', not_going: "Can't make it", waitlist: 'Waitlist' };

/**
 * Who's coming. The database decides what this list contains
 * (ec_event_attendees): the host side gets everyone who responded and can
 * check people in; a member going to a private gathering sees the others
 * going, by first name and initial.
 */
export function AttendeeList({
  eventId,
  attendees,
  canCheckIn,
  started,
}: {
  eventId: string;
  attendees: EventAttendee[];
  canCheckIn: boolean;
  started: boolean;
}) {
  const [rows, setRows] = useState(attendees);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(a: EventAttendee) {
    setError(null);
    const next = !a.attended_at;
    startTransition(async () => {
      const r = await setAttendance(eventId, a.profile_id, next);
      if (r.success) {
        setRows((prev) =>
          prev.map((x) => (x.profile_id === a.profile_id ? { ...x, attended_at: next ? new Date().toISOString() : null } : x)),
        );
      } else {
        setError(r.error);
      }
    });
  }

  if (rows.length === 0) return null;
  const goingCount = rows.filter((r) => r.status === 'going').length;

  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">
        {canCheckIn ? `Responses (${rows.length})` : `Who's going (${goingCount})`}
      </h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {rows.map((a) => (
          <li key={a.profile_id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-foreground">
              {a.first_name} {a.last_name ? (a.last_name.length === 1 ? `${a.last_name}.` : a.last_name) : ''}
              {a.guest_count > 0 && <span className="text-foreground-subtle"> +{a.guest_count}</span>}
            </span>
            <span className="flex items-center gap-3">
              {canCheckIn && <span className="text-xs text-foreground-muted">{LABEL[a.status]}</span>}
              {canCheckIn && a.status === 'going' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(a)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                    a.attended_at ? 'border-success bg-success-bg text-success' : 'border-border text-foreground-muted',
                  )}
                  title={started ? 'Mark who came' : 'You can check people in once it starts'}
                >
                  <Check className="h-3 w-3" />
                  {a.attended_at ? 'Came' : 'Check in'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}
