import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { updateApptType } from '@/lib/appointment-types/actions';
import { AppointmentTypeForm } from '../appointment-type-form';

export default async function EditAppointmentTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireChurchAdmin();
  const { id } = await params;
  const admin = await createServiceRoleClient();

  const { data } = await admin
    .from('scheduling_appointment_types')
    .select(
      'id, name, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, min_notice_hours, max_advance_days, requires_confirmation, is_public, is_active',
    )
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();

  const update = updateApptType.bind(null, id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/settings/appointment-types"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Appointment Types
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Edit appointment type
        </h1>
      </div>
      <AppointmentTypeForm
        appointmentType={data as never}
        action={update}
        submitLabel="Save changes"
      />
    </div>
  );
}
