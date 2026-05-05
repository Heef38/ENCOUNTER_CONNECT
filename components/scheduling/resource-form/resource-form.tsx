'use client';

import { useState } from 'react';
import type { SchedulingResource, CreateResourceInput, SchedulingResourceKind } from '@/lib/scheduling/types';
import { actionCreateResource, actionUpdateResource } from '@/app/scheduling/actions';

const KINDS: SchedulingResourceKind[] = ['person', 'room', 'equipment', 'class_slot', 'virtual', 'other'];

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'UTC',
];

interface ResourceFormProps {
  resource?: SchedulingResource;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ResourceForm({ resource, onSuccess, onCancel }: ResourceFormProps) {
  const [name, setName] = useState(resource?.name ?? '');
  const [kind, setKind] = useState<SchedulingResourceKind>(resource?.kind ?? 'person');
  const [description, setDescription] = useState(resource?.description ?? '');
  const [email, setEmail] = useState(resource?.email ?? '');
  const [phone, setPhone] = useState(resource?.phone ?? '');
  const [timezone, setTimezone] = useState(resource?.timezone ?? 'America/Chicago');
  const [capacity, setCapacity] = useState(resource?.default_capacity ?? 1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateResourceInput = {
        name, kind, description: description || undefined,
        email: email || undefined, phone: phone || undefined,
        timezone, default_capacity: capacity,
      };
      const result = resource
        ? await actionUpdateResource(resource.id, input)
        : await actionCreateResource(input);

      if (result.success) {
        onSuccess?.();
      } else {
        setError(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div>
        <label className="block text-sm font-medium text-gray-700">Name *</label>
        <input
          required value={name} onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Kind</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SchedulingResourceKind)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k.replace('_', ' ')}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Description</label>
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Timezone</label>
          <select
            value={timezone} onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Default Capacity</label>
          <input
            type="number" min={1} value={capacity}
            onChange={(e) => setCapacity(parseInt(e.target.value))}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
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
          {submitting ? 'Saving…' : resource ? 'Update Resource' : 'Create Resource'}
        </button>
      </div>
    </form>
  );
}
