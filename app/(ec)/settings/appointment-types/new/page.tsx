import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createApptType } from '@/lib/appointment-types/actions';
import { AppointmentTypeForm } from '../appointment-type-form';

export default async function NewAppointmentTypePage() {
  await requireChurchAdmin();

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
          New appointment type
        </h1>
      </div>
      <AppointmentTypeForm action={createApptType} submitLabel="Create appointment type" />
    </div>
  );
}
