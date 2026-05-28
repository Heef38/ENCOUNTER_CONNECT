'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionResult } from '@/lib/appointment-types/actions';

interface ApptType {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_hours: number | null;
  max_advance_days: number | null;
  requires_confirmation: boolean;
  is_public: boolean;
  is_active: boolean;
}

interface Props {
  appointmentType?: ApptType;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
}

export function AppointmentTypeForm({ appointmentType, action, submitLabel }: Props) {
  const router = useRouter();
  const isEdit = !!appointmentType;
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        router.push('/settings/appointment-types');
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name <span className="text-danger">*</span></Label>
        <Input id="name" name="name" required defaultValue={appointmentType?.name ?? ''} placeholder="Connect Meeting" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={appointmentType?.description ?? ''} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="duration_minutes">Duration (minutes) <span className="text-danger">*</span></Label>
          <Input id="duration_minutes" name="duration_minutes" type="number" min={1} required defaultValue={appointmentType?.duration_minutes ?? 60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="min_notice_hours">Min notice (hours)</Label>
          <Input id="min_notice_hours" name="min_notice_hours" type="number" min={0} defaultValue={appointmentType?.min_notice_hours ?? 24} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max_advance_days">Bookable up to (days ahead)</Label>
          <Input id="max_advance_days" name="max_advance_days" type="number" min={0} defaultValue={appointmentType?.max_advance_days ?? 90} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="buffer_before_minutes">Buffer before</Label>
            <Input id="buffer_before_minutes" name="buffer_before_minutes" type="number" min={0} defaultValue={appointmentType?.buffer_before_minutes ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="buffer_after_minutes">Buffer after</Label>
            <Input id="buffer_after_minutes" name="buffer_after_minutes" type="number" min={0} defaultValue={appointmentType?.buffer_after_minutes ?? 0} />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requires_confirmation" defaultChecked={appointmentType?.requires_confirmation ?? false} className="h-4 w-4 rounded border-border accent-primary" />
        <span className="text-foreground">Requires connector confirmation</span>
      </label>
      <p className="-mt-3 text-xs text-foreground-subtle">
        When on, a participant&apos;s booking is a request the connector must confirm or decline.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_public" defaultChecked={appointmentType?.is_public ?? true} className="h-4 w-4 rounded border-border accent-primary" />
        <span className="text-foreground">Public (bookable by participants)</span>
      </label>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={appointmentType?.is_active ?? true} className="h-4 w-4 rounded border-border accent-primary" />
          <span className="text-foreground">Active</span>
        </label>
      )}

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
