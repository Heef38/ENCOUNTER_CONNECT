import { notFound } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getBooking } from '@/lib/scheduling/services/bookings';
import { StatusBadge } from '@/components/scheduling/status-badge';
import { BookingActions } from './booking-actions';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServiceRoleClient();
  const result = await getBooking(supabase, id);

  if (!result.success) notFound();
  const b = result.data;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <Link href="/scheduling/bookings" className="text-sm text-gray-500 hover:text-gray-700">
          ← Bookings
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {b.title ?? b.appointment_type?.name ?? 'Booking'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {b.starts_at ? format(parseISO(b.starts_at), 'EEEE, MMMM d, yyyy · h:mm a') : ''}
            </p>
          </div>
          <StatusBadge status={b.status} className="mt-1" />
        </div>
      </div>

      {/* Details grid */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-gray-500">Appointment Type</dt><dd className="font-medium">{b.appointment_type?.name ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Resource</dt><dd className="font-medium">{b.resource?.name ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Location</dt><dd className="font-medium">{b.location?.name ?? '—'}</dd></div>
          <div><dt className="text-gray-500">Duration</dt><dd className="font-medium">{b.appointment_type?.duration_minutes} min</dd></div>
          <div><dt className="text-gray-500">Timezone</dt><dd className="font-medium">{b.timezone}</dd></div>
          <div><dt className="text-gray-500">Mode</dt><dd className="font-medium capitalize">{b.appointment_type?.location_mode?.replace('_', ' ') ?? '—'}</dd></div>
          {b.notes && (
            <div className="col-span-2">
              <dt className="text-gray-500">Notes</dt>
              <dd className="mt-0.5 font-medium">{b.notes}</dd>
            </div>
          )}
          {b.cancellation_reason && (
            <div className="col-span-2">
              <dt className="text-gray-500">Cancellation Reason</dt>
              <dd className="mt-0.5 text-red-700">{b.cancellation_reason}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Attendees */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Attendees</h2>
        {b.attendees?.length ? (
          <ul className="divide-y divide-gray-100">
            {b.attendees.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.display_name}</p>
                  <p className="text-xs text-gray-500">{a.email ?? a.phone ?? ''}</p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 capitalize">{a.role}</span>
                  {a.attended !== null && (
                    <p className="mt-0.5 text-xs text-gray-500">{a.attended ? 'Attended' : 'Absent'}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No attendees recorded.</p>
        )}
      </section>

      {/* Status history */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Status Timeline</h2>
        {b.status_history?.length ? (
          <ol className="relative ml-3 space-y-4 border-l border-gray-200 pl-5">
            {b.status_history.map((h) => (
              <li key={h.id} className="text-sm">
                <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-white bg-gray-400" />
                <p className="font-medium text-gray-900">
                  {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status}
                </p>
                <p className="text-xs text-gray-500">
                  {format(parseISO(h.created_at), 'MMM d, yyyy h:mm a')}
                  {h.reason ? ` · ${h.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-500">No status changes recorded.</p>
        )}
      </section>

      {/* Outcome */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Outcome</h2>
        {b.outcome ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-500">Kind</dt><dd className="font-medium capitalize">{b.outcome.kind.replace(/_/g, ' ')}</dd></div>
            {b.outcome.summary && <div className="col-span-2"><dt className="text-gray-500">Summary</dt><dd>{b.outcome.summary}</dd></div>}
            {b.outcome.next_action && <div className="col-span-2"><dt className="text-gray-500">Next Action</dt><dd>{b.outcome.next_action}</dd></div>}
          </dl>
        ) : (
          <p className="text-sm text-gray-500">No outcome recorded yet.</p>
        )}
      </section>

      {/* External refs */}
      {b.external_refs?.length ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">External References</h2>
          <ul className="divide-y divide-gray-100">
            {b.external_refs.map((ref) => (
              <li key={ref.id} className="py-2 text-sm">
                <span className="font-medium text-gray-700">{ref.external_type}</span>
                <span className="mx-2 text-gray-400">·</span>
                <span className="font-mono text-gray-600">{ref.external_id}</span>
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{ref.relation_kind}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Reminders */}
      {b.reminders?.length ? (
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Reminders</h2>
          <ul className="divide-y divide-gray-100">
            {b.reminders.map((r) => (
              <li key={r.id} className="flex justify-between py-2 text-sm">
                <span className="capitalize">{r.channel} · {r.offset_minutes}m before</span>
                <span className={`capitalize font-medium ${r.status === 'sent' ? 'text-green-600' : r.status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Actions */}
      <BookingActions booking={b} />
    </div>
  );
}
