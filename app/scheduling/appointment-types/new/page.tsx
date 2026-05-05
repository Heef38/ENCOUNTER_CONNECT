'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppointmentTypeForm } from '@/components/scheduling/appointment-type-form/appointment-type-form';

export default function NewAppointmentTypePage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/scheduling/appointment-types" className="text-sm text-gray-500 hover:text-gray-700">
          ← Appointment Types
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">New Appointment Type</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <AppointmentTypeForm
          onSuccess={() => router.push('/scheduling/appointment-types')}
          onCancel={() => router.push('/scheduling/appointment-types')}
        />
      </div>
    </div>
  );
}
