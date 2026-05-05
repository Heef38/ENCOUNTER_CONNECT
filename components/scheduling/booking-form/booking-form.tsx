'use client';

import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import type {
  SchedulingAppointmentType,
  SchedulingResource,
  TimeSlot,
} from '@/lib/scheduling/types';
import { actionCreateBooking } from '@/app/scheduling/actions';
import { formatSlotRange } from '@/lib/scheduling/slot-engine';

interface BookingFormProps {
  appointmentTypes: SchedulingAppointmentType[];
  resources: SchedulingResource[];
  /** When set, skips the type-picker step and pre-selects this appointment type. */
  presetTypeId?: string | null;
  onSuccess?: (bookingId: string) => void;
}

export function BookingForm({
  appointmentTypes,
  resources,
  presetTypeId,
  onSuccess,
}: BookingFormProps) {
  const presetType = presetTypeId
    ? appointmentTypes.find((t) => t.id === presetTypeId) ?? null
    : null;
  const [step, setStep] = useState<'type' | 'resource' | 'slot' | 'attendee' | 'confirm'>(
    presetType ? 'resource' : 'type',
  );
  const [selectedType, setSelectedType] = useState<SchedulingAppointmentType | null>(presetType);
  const [selectedResource, setSelectedResource] = useState<SchedulingResource | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [attendeeName, setAttendeeName] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');
  const [attendeePhone, setAttendeePhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSlots() {
    if (!selectedType || !selectedResource) return;
    setLoadingSlots(true);
    setSlots([]);
    try {
      const res = await fetch(
        `/api/scheduling/slots?appointment_type_id=${selectedType.id}&resource_id=${selectedResource.id}&date_from=${new Date().toISOString()}&date_to=${addDays(new Date(), 14).toISOString()}`
      );
      const json = await res.json();
      if (json.data) setSlots(json.data.filter((s: TimeSlot) => s.available));
    } catch {
      setError('Failed to load available slots');
    } finally {
      setLoadingSlots(false);
    }
  }

  useEffect(() => {
    if (step === 'slot' && selectedType && selectedResource) {
      loadSlots();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleSubmit() {
    if (!selectedType || !selectedSlot || !attendeeName) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await actionCreateBooking({
        appointment_type_id: selectedType.id,
        resource_id: selectedResource?.id,
        starts_at: selectedSlot.starts_at.toISOString(),
        notes: notes || undefined,
        attendees: [
          {
            display_name: attendeeName,
            email: attendeeEmail || undefined,
            phone: attendeePhone || undefined,
            role: 'primary',
          },
        ],
      });
      if (result.success) {
        onSuccess?.(result.data.id);
      } else {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {(['type', 'resource', 'slot', 'attendee', 'confirm'] as const).map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                step === s
                  ? 'bg-blue-600 text-white'
                  : i < (['type', 'resource', 'slot', 'attendee', 'confirm'] as const).indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1}
            </span>
            {i < 4 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* STEP 1: Select appointment type */}
      {step === 'type' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Select Appointment Type</h2>
          <div className="space-y-2">
            {appointmentTypes.filter((t) => t.is_active).map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedType(t); setStep('resource'); }}
                className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50"
              >
                <p className="font-medium text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-500">
                  {t.duration_minutes} min · {t.location_mode.replace('_', ' ')}
                </p>
                {t.description && (
                  <p className="mt-1 text-xs text-gray-400">{t.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Select resource */}
      {step === 'resource' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Select Resource</h2>
          <div className="space-y-2">
            {resources.filter((r) => r.is_active).map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelectedResource(r); setStep('slot'); }}
                className="w-full rounded-lg border border-gray-200 p-4 text-left hover:border-blue-400 hover:bg-blue-50"
              >
                <p className="font-medium text-gray-900">{r.name}</p>
                <p className="text-sm text-gray-500 capitalize">{r.kind}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep('type')} className="mt-4 text-sm text-gray-500 underline">
            ← Back
          </button>
        </div>
      )}

      {/* STEP 3: Select time slot */}
      {step === 'slot' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Choose a Time</h2>
          {loadingSlots && <p className="text-sm text-gray-500">Loading available times…</p>}
          {!loadingSlots && !slots.length && (
            <p className="text-sm text-gray-500">No available slots in the next 14 days.</p>
          )}
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {slots.map((slot, i) => (
              <button
                key={i}
                onClick={() => { setSelectedSlot(slot); setStep('attendee'); }}
                className="w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50"
              >
                <p className="font-medium text-gray-900">
                  {format(slot.starts_at, 'EEE, MMM d')}
                </p>
                <p className="text-sm text-gray-500">{formatSlotRange(slot)}</p>
              </button>
            ))}
          </div>
          <button onClick={() => setStep('resource')} className="mt-4 text-sm text-gray-500 underline">
            ← Back
          </button>
        </div>
      )}

      {/* STEP 4: Attendee info */}
      {step === 'attendee' && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Your Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Full Name *</label>
              <input
                type="text"
                value={attendeeName}
                onChange={(e) => setAttendeeName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={attendeePhone}
                onChange={(e) => setAttendeePhone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep('slot')} className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={!attendeeName}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Confirm */}
      {step === 'confirm' && selectedType && selectedSlot && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Confirm Booking</h2>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium">{selectedType.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Resource</span>
              <span className="font-medium">{selectedResource?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-medium">{format(selectedSlot.starts_at, 'EEE, MMM d, yyyy')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Time</span>
              <span className="font-medium">{formatSlotRange(selectedSlot)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{attendeeName}</span>
            </div>
            {attendeeEmail && (
              <div className="flex justify-between">
                <span className="text-gray-500">Email</span>
                <span className="font-medium">{attendeeEmail}</span>
              </div>
            )}
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep('attendee')} className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Booking…' : 'Confirm Booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
