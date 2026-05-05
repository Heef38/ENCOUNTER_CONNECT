import type { SchedulingBooking, SchedulingAppointmentType, SchedulingResource } from '@/lib/scheduling/types';
import { BookingRow } from './booking-row';

type BookingWithJoins = SchedulingBooking & {
  appointment_type?: SchedulingAppointmentType | null;
  resource?: SchedulingResource | null;
};

interface BookingsTableProps {
  bookings: BookingWithJoins[];
}

export function BookingsTable({ bookings }: BookingsTableProps) {
  if (!bookings.length) {
    return (
      <div className="py-12 text-center text-gray-500">
        No bookings found matching your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {['Title', 'Date', 'Time', 'Resource', 'Type', 'Status', ''].map((h) => (
              <th
                key={h}
                className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {bookings.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
