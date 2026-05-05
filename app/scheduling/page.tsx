import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { StatsCard } from '@/components/scheduling/dashboard/stats-card';
import { BookingsTable } from '@/components/scheduling/booking-list/bookings-table';
import type { SchedulingBookingStatus } from '@/lib/scheduling/types';

const STATUS_GROUPS: { label: string; statuses: SchedulingBookingStatus[]; color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' }[] = [
  { label: 'Confirmed',   statuses: ['confirmed'],            color: 'blue'   },
  { label: 'Pending',     statuses: ['pending_confirmation'], color: 'yellow' },
  { label: 'Completed',   statuses: ['completed'],            color: 'green'  },
  { label: 'Cancelled',   statuses: ['cancelled'],            color: 'red'    },
  { label: 'No-Show',     statuses: ['no_show'],              color: 'purple' },
];

export default async function SchedulingDashboard() {
  const supabase = await createServiceRoleClient();

  const { data: allBookings } = await supabase
    .from('scheduling_bookings')
    .select(`
      *,
      appointment_type:scheduling_appointment_types(*),
      resource:scheduling_resources(*)
    `)
    .order('starts_at', { ascending: true })
    .limit(200);

  const bookings = allBookings ?? [];

  // Stats
  const counts: Record<string, number> = {};
  bookings.forEach((b) => {
    counts[b.status] = (counts[b.status] ?? 0) + 1;
  });

  // Upcoming = confirmed or pending, in the future
  const now = new Date();
  const upcoming = bookings.filter(
    (b) =>
      ['confirmed', 'pending_confirmation'].includes(b.status) &&
      new Date(b.starts_at) >= now
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scheduling Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of all bookings and resources</p>
        </div>
        <Link
          href="/scheduling/new-booking"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Booking
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_GROUPS.map(({ label, statuses, color }) => {
          const count = statuses.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
          return <StatsCard key={label} title={label} value={count} color={color} />;
        })}
      </div>

      {/* Upcoming */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming Bookings</h2>
          <Link href="/scheduling/bookings" className="text-sm text-blue-600 hover:text-blue-800">
            View all →
          </Link>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <BookingsTable bookings={upcoming.slice(0, 10) as never} />
        </div>
      </div>
    </div>
  );
}
