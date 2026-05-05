import Link from 'next/link';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ResourceCard } from './resource-card';

export default async function ResourcesPage() {
  const supabase = await createServiceRoleClient();
  const { data: resources } = await supabase
    .from('scheduling_resources')
    .select(`*, location:scheduling_locations(*), group:scheduling_resource_groups(*)`)
    .order('name');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <Link
          href="/scheduling/resources/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Resource
        </Link>
      </div>

      {!resources?.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <p className="text-gray-500">No resources yet.</p>
          <Link href="/scheduling/resources/new" className="mt-2 block text-sm text-blue-600 hover:text-blue-800">
            Create your first resource
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((r) => (
            <ResourceCard key={r.id} resource={r as never} />
          ))}
        </div>
      )}
    </div>
  );
}
