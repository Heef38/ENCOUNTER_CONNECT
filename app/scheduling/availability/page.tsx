import { createServiceRoleClient } from '@/lib/supabase/server';
import { AvailabilityEditor } from '@/components/scheduling/availability-editor/availability-editor';
import { ResourceSelector } from './resource-selector';
import type { SchedulingResource } from '@/lib/scheduling/types';

interface PageProps {
  searchParams: Promise<{ resource_id?: string }>;
}

export default async function AvailabilityPage({ searchParams }: PageProps) {
  const { resource_id } = await searchParams;
  const supabase = await createServiceRoleClient();

  const { data: resources } = await supabase
    .from('scheduling_resources')
    .select('id, name, kind')
    .eq('is_active', true)
    .order('name');

  const selectedId = resource_id ?? resources?.[0]?.id;

  let rules: unknown[] = [];
  let blackouts: unknown[] = [];

  if (selectedId) {
    const { data: r } = await supabase
      .from('scheduling_availability_rules')
      .select('*')
      .eq('resource_id', selectedId)
      .eq('is_active', true)
      .order('day_of_week');

    const { data: b } = await supabase
      .from('scheduling_blackouts')
      .select('*')
      .eq('resource_id', selectedId)
      .eq('is_active', true)
      .order('starts_at');

    rules = r ?? [];
    blackouts = b ?? [];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Availability</h1>

      {/* Resource selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Resource</label>
        <ResourceSelector
          resources={(resources ?? []).map((r: Pick<SchedulingResource, 'id' | 'name' | 'kind'>) => ({ id: r.id, name: r.name }))}
          selectedId={selectedId ?? ''}
        />
      </div>

      {selectedId ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <AvailabilityEditor
            resourceId={selectedId}
            initialRules={rules as never}
            initialBlackouts={blackouts as never}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-500">
          No resources found. Add a resource first.
        </div>
      )}
    </div>
  );
}
