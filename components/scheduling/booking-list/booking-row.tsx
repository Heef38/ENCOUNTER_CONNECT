import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { SchedulingBooking, SchedulingAppointmentType, SchedulingResource } from '@/lib/scheduling/types';
import { StatusBadge } from '../status-badge';

interface BookingRowProps {
  booking: SchedulingBooking & {
    appointment_type?: SchedulingAppointmentType | null;
    resource?: SchedulingResource | null;
  };
}

export function BookingRow({ booking }: BookingRowProps) {
  const startDate = parseISO(booking.starts_at);
  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm">
        <Link
          href={`/scheduling/bookings/${booking.id}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          {booking.title ?? booking.appointment_type?.name ?? 'Booking'}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
        {format(startDate, 'MMM d, yyyy')}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
        {format(startDate, 'h:mm a')}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
        {booking.resource?.name ?? '—'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
        {booking.appointment_type?.name ?? '—'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm">
        <StatusBadge status={booking.status} />
      </td>
      <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right text-sm">
        <Link
          href={`/scheduling/bookings/${booking.id}`}
          className="text-gray-400 hover:text-gray-600"
        >
          View →
        </Link>
      </td>
    </tr>
  );
}
