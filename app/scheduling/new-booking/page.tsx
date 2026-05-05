'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SchedulingAppointmentType, SchedulingResource } from '@/lib/scheduling/types';
import { BookingForm } from '@/components/scheduling/booking-form/booking-form';
import { linkBookingToProgress } from '@/lib/journey/actions';

export default function NewBookingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const presetTypeId = params.get('type');
  const progressId = params.get('progress');

  const [appointmentTypes, setAppointmentTypes] = useState<SchedulingAppointmentType[]>([]);
  const [resources, setResources] = useState<SchedulingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/scheduling/appointment-types').then((r) => r.json()),
      fetch('/api/scheduling/resources').then((r) => r.json()),
    ]).then(([at, res]) => {
      setAppointmentTypes(at.data ?? []);
      setResources(res.data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;

  async function handleSuccess(bookingId: string) {
    if (progressId) {
      setLinking(true);
      setLinkError(null);
      const result = await linkBookingToProgress(progressId, bookingId);
      setLinking(false);
      if (!result.ok) {
        setLinkError(result.error ?? 'Could not link booking to your journey step.');
        return;
      }
      router.push(`/journey/steps/${progressId}`);
      return;
    }
    router.push(`/scheduling/bookings/${bookingId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={progressId ? `/journey/steps/${progressId}` : '/scheduling/bookings'}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {progressId ? 'Back to your journey' : 'Bookings'}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">New Booking</h1>
        {progressId && (
          <p className="mt-1 text-sm text-gray-500">
            Booking this appointment will mark the journey step as scheduled.
          </p>
        )}
      </div>

      {linkError && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {linkError} The booking was created — return to your journey to link it manually.
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <BookingForm
          appointmentTypes={appointmentTypes}
          resources={resources}
          presetTypeId={presetTypeId}
          onSuccess={handleSuccess}
        />
      </div>

      {linking && (
        <p className="text-xs text-gray-500">Linking your booking to the journey step…</p>
      )}
    </div>
  );
}
