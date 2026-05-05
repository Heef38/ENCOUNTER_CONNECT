'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingWithRelations, SchedulingOutcomeKind } from '@/lib/scheduling/types';
import {
  actionCancelBooking,
  actionConfirmBooking,
  actionCompleteBooking,
  actionMarkNoShow,
} from '@/app/scheduling/actions';

const OUTCOME_KINDS: SchedulingOutcomeKind[] = [
  'completed_successfully',
  'follow_up_required',
  'no_show',
  'needs_reassignment',
  'next_action_recommended',
  'other',
];

interface BookingActionsProps {
  booking: BookingWithRelations;
}

export function BookingActions({ booking }: BookingActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);
  const [outcomeKind, setOutcomeKind] = useState<SchedulingOutcomeKind>('completed_successfully');
  const [outcomeSummary, setOutcomeSummary] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const { status } = booking;

  async function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setLoading(label);
    setError(null);
    const result = await fn();
    setLoading(null);
    if (!result.success && result.error) {
      setError(result.error);
    } else {
      router.refresh();
    }
  }

  if (['completed', 'cancelled', 'rescheduled'].includes(status)) {
    return null;
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Actions</h2>

      {error && <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-3">
        {status === 'pending_confirmation' && (
          <button
            disabled={!!loading}
            onClick={() => run('confirm', () => actionConfirmBooking(booking.id))}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === 'confirm' ? 'Confirming…' : 'Confirm'}
          </button>
        )}

        {['confirmed', 'pending_confirmation'].includes(status) && (
          <>
            <button
              onClick={() => setShowComplete(!showComplete)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Mark Complete
            </button>
            <button
              disabled={!!loading}
              onClick={() => run('no_show', () => actionMarkNoShow(booking.id))}
              className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {loading === 'no_show' ? 'Saving…' : 'No Show'}
            </button>
          </>
        )}

        <button
          onClick={() => setShowCancel(!showCancel)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Cancel Booking
        </button>
      </div>

      {showComplete && (
        <div className="mt-4 space-y-3 rounded-md bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-700">Record Outcome</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600">Outcome Kind</label>
            <select
              value={outcomeKind}
              onChange={(e) => setOutcomeKind(e.target.value as SchedulingOutcomeKind)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            >
              {OUTCOME_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Summary</label>
            <textarea
              value={outcomeSummary}
              onChange={(e) => setOutcomeSummary(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Next Action</label>
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={!!loading}
              onClick={() =>
                run('complete', () =>
                  actionCompleteBooking(booking.id, {
                    booking_id: booking.id,
                    kind: outcomeKind,
                    summary: outcomeSummary || undefined,
                    next_action: nextAction || undefined,
                  })
                )
              }
              className="rounded-md bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading === 'complete' ? 'Saving…' : 'Confirm Complete'}
            </button>
            <button onClick={() => setShowComplete(false)} className="text-sm text-gray-500 underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="mt-4 space-y-3 rounded-md bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-700">Cancel Booking</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600">Reason (optional)</label>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={!!loading}
              onClick={() => run('cancel', () => actionCancelBooking(booking.id, cancelReason || undefined))}
              className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading === 'cancel' ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
            <button onClick={() => setShowCancel(false)} className="text-sm text-gray-500 underline">
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
