import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { SchedulingAppointmentType } from '@/lib/scheduling/types';

export default async function AppointmentTypesPage() {
  const supabase = await createServiceRoleClient();
  const { data: types } = await supabase
    .from('scheduling_appointment_types')
    .select('*')
    .order('name');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Appointment Types</h1>
        <Link
          href="/scheduling/appointment-types/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Type
        </Link>
      </div>

      {!types?.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-500">No appointment types yet.</p>
          <Link href="/scheduling/appointment-types/new" className="mt-2 block text-sm text-blue-600">
            Create your first appointment type
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'Duration', 'Mode', 'Max Attendees', 'Status', ''].map((h) => (
                  <th key={h} className="py-3 pl-4 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(types as SchedulingAppointmentType[]).map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="py-3 pl-4 pr-3 text-sm font-medium text-gray-900">{t.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{t.duration_minutes} min</td>
                  <td className="px-3 py-3 text-sm text-gray-600 capitalize">{t.location_mode.replace('_', ' ')}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{t.max_attendees}</td>
                  <td className="px-3 py-3 text-sm">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right text-sm">
                    <Link href={`/scheduling/appointment-types/${t.id}`} className="text-blue-600 hover:text-blue-800">
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
