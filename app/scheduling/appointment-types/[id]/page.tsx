'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SchedulingAppointmentType } from '@/lib/scheduling/types';
import { AppointmentTypeForm } from '@/components/scheduling/appointment-type-form/appointment-type-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditAppointmentTypePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [at, setAt] = useState<SchedulingAppointmentType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/scheduling/appointment-types/${id}`)
      .then((r) => r.json())
      .then((j) => { setAt(j.data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!at) return <div className="p-8 text-sm text-red-500">Not found.</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/scheduling/appointment-types" className="text-sm text-gray-500 hover:text-gray-700">
          ← Appointment Types
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Edit Appointment Type</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <AppointmentTypeForm
          appointmentType={at}
          onSuccess={() => router.push('/scheduling/appointment-types')}
          onCancel={() => router.push('/scheduling/appointment-types')}
        />
      </div>
    </div>
  );
}
