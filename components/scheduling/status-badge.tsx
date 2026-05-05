import type { SchedulingBookingStatus } from '@/lib/scheduling/types';

const STATUS_STYLES: Record<SchedulingBookingStatus, string> = {
  draft:                'bg-gray-100 text-gray-700',
  pending_confirmation: 'bg-yellow-100 text-yellow-800',
  confirmed:            'bg-blue-100 text-blue-800',
  completed:            'bg-green-100 text-green-800',
  cancelled:            'bg-red-100 text-red-700',
  no_show:              'bg-orange-100 text-orange-800',
  rescheduled:          'bg-purple-100 text-purple-800',
};

const STATUS_LABELS: Record<SchedulingBookingStatus, string> = {
  draft:                'Draft',
  pending_confirmation: 'Pending',
  confirmed:            'Confirmed',
  completed:            'Completed',
  cancelled:            'Cancelled',
  no_show:              'No Show',
  rescheduled:          'Rescheduled',
};

interface StatusBadgeProps {
  status: SchedulingBookingStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
