'use client';

import { useState } from 'react';
import type {
  SchedulingAppointmentType,
  CreateAppointmentTypeInput,
  SchedulingLocationMode,
} from '@/lib/scheduling/types';
import {
  actionCreateAppointmentType,
  actionUpdateAppointmentType,
} from '@/app/scheduling/actions';

const LOCATION_MODES: SchedulingLocationMode[] = ['in_person', 'phone', 'video', 'hybrid', 'custom'];

interface AppointmentTypeFormProps {
  appointmentType?: SchedulingAppointmentType;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function AppointmentTypeForm({ appointmentType, onSuccess, onCancel }: AppointmentTypeFormProps) {
  const at = appointmentType;
  const [name, setName] = useState(at?.name ?? '');
  const [slug, setSlug] = useState(at?.slug ?? '');
  const [description, setDescription] = useState(at?.description ?? '');
  const [duration, setDuration] = useState(at?.duration_minutes ?? 60);
  const [bufferBefore, setBufferBefore] = useState(at?.buffer_before_minutes ?? 0);
  const [bufferAfter, setBufferAfter] = useState(at?.buffer_after_minutes ?? 0);
  const [minNotice, setMinNotice] = useState(at?.min_notice_hours ?? 24);
  const [maxAdvance, setMaxAdvance] = useState(at?.max_advance_days ?? 90);
  const [cancelCutoff, setCancelCutoff] = useState(at?.cancellation_cutoff_hours ?? 24);
  const [maxAttendees, setMaxAttendees] = useState(at?.max_attendees ?? 1);
  const [requiresConfirmation, setRequiresConfirmation] = useState(at?.requires_confirmation ?? false);
  const [locationMode, setLocationMode] = useState<SchedulingLocationMode>(at?.location_mode ?? 'in_person');
  const [isPublic, setIsPublic] = useState(at?.is_public ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateAppointmentTypeInput = {
        name, slug: slug || undefined,
        description: description || undefined,
        duration_minutes: duration,
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes: bufferAfter,
        min_notice_hours: minNotice,
        max_advance_days: maxAdvance,
        cancellation_cutoff_hours: cancelCutoff,
        max_attendees: maxAttendees,
        requires_confirmation: requiresConfirmation,
        location_mode: locationMode,
        is_public: isPublic,
      };
      const result = at
        ? await actionUpdateAppointmentType(at.id, input)
        : await actionCreateAppointmentType(input);

      if (result.success) onSuccess?.();
      else setError(result.error);
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Slug (optional URL key)</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={field} placeholder="e.g. connector-meeting" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Duration (min) *</label>
          <input required type="number" min={5} value={duration} onChange={(e) => setDuration(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Attendees</label>
          <input type="number" min={1} value={maxAttendees} onChange={(e) => setMaxAttendees(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Buffer Before (min)</label>
          <input type="number" min={0} value={bufferBefore} onChange={(e) => setBufferBefore(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Buffer After (min)</label>
          <input type="number" min={0} value={bufferAfter} onChange={(e) => setBufferAfter(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Min Notice (hours)</label>
          <input type="number" min={0} value={minNotice} onChange={(e) => setMinNotice(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max Advance (days)</label>
          <input type="number" min={1} value={maxAdvance} onChange={(e) => setMaxAdvance(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cancellation Cutoff (hours)</label>
          <input type="number" min={0} value={cancelCutoff} onChange={(e) => setCancelCutoff(+e.target.value)} className={field} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Location Mode</label>
          <select value={locationMode} onChange={(e) => setLocationMode(e.target.value as SchedulingLocationMode)} className={field}>
            {LOCATION_MODES.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={requiresConfirmation} onChange={(e) => setRequiresConfirmation(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Requires Confirmation
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          Publicly Bookable
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {submitting ? 'Saving…' : at ? 'Update' : 'Create Appointment Type'}
        </button>
      </div>
    </form>
  );
}
