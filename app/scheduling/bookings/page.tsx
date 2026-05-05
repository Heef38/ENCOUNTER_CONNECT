import { createServiceRoleClient } from '@/lib/supabase/server';
import { BookingsTable } from '@/components/scheduling/booking-list/bookings-table';
import Link from 'next/link';
import type { SchedulingBookingStatus } from '@/lib/scheduling/types';

const ALL_STATUSES: SchedulingBookingStatus[] = [
  'draft', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled',
];

interface PageProps {
  searchParams: Promise<{
    status?: string;
    resource_id?: string;
    appointment_type_id?: string;
    date_from?: string;
    date_to?: string;
  }>;
}

export default async function BookingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServiceRoleClient();

  let query = supabase
    .from('scheduling_bookings')
    .select(`
      *,
      appointment_type:scheduling_appointment_types(*),
      resource:scheduling_resources(*)
    `)
    .order('starts_at', { ascending: false })
    .limit(100);

  if (params.status && ALL_STATUSES.includes(params.status as SchedulingBookingStatus)) {
    query = query.eq('status', params.status);
  }
  if (params.resource_id)         query = query.eq('resource_id', params.resource_id);
  if (params.appointment_type_id) query = query.eq('appointment_type_id', params.appointment_type_id);
  if (params.date_from)           query = query.gte('starts_at', params.date_from);
  if (params.date_to)             query = query.lte('starts_at', params.date_to);

  const { data: bookings } = await query;

  // For filter dropdowns
  const { data: resources }        = await supabase.from('scheduling_resources').select('id,name').eq('is_active', true);
  const { data: appointmentTypes } = await supabase.from('scheduling_appointment_types').select('id,name').eq('is_active', true);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <Link
          href="/scheduling/new-booking"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Booking
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3">
        <select name="status" defaultValue={params.status ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>

        <select name="resource_id" defaultValue={params.resource_id ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Resources</option>
          {(resources ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <select name="appointment_type_id" defaultValue={params.appointment_type_id ?? ''}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="">All Types</option>
          {(appointmentTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <input type="date" name="date_from" defaultValue={params.date_from ?? ''}
          placeholder="From date"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />

        <input type="date" name="date_to" defaultValue={params.date_to ?? ''}
          placeholder="To date"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />

        <button type="submit"
          className="rounded-md bg-gray-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700">
          Filter
        </button>
        <a href="/scheduling/bookings" className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          Clear
        </a>
      </form>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <BookingsTable bookings={(bookings ?? []) as never} />
      </div>
    </div>
  );
}
