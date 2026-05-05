import Link from 'next/link';
import type { SchedulingResource, SchedulingLocation } from '@/lib/scheduling/types';

interface ResourceCardProps {
  resource: SchedulingResource & { location?: SchedulingLocation | null };
}

const KIND_BADGE: Record<string, string> = {
  person:     'bg-blue-100 text-blue-800',
  room:       'bg-green-100 text-green-800',
  equipment:  'bg-yellow-100 text-yellow-800',
  class_slot: 'bg-purple-100 text-purple-800',
  virtual:    'bg-cyan-100 text-cyan-800',
  other:      'bg-gray-100 text-gray-700',
};

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <div className={`rounded-lg border bg-white p-4 ${!resource.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{resource.name}</p>
          <p className="mt-0.5 text-xs text-gray-500">{resource.location?.name ?? 'No location'}</p>
        </div>
        <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[resource.kind] ?? KIND_BADGE.other}`}>
          {resource.kind.replace('_', ' ')}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-xs ${resource.is_active ? 'text-green-600' : 'text-gray-400'}`}>
          {resource.is_active ? 'Active' : 'Inactive'}
        </span>
        <div className="flex gap-3">
          <Link href={`/scheduling/availability?resource_id=${resource.id}`}
            className="text-xs text-gray-500 hover:text-blue-600">
            Availability
          </Link>
          <Link href={`/scheduling/resources/${resource.id}`}
            className="text-xs text-blue-600 hover:text-blue-800">
            Edit →
          </Link>
        </div>
      </div>
    </div>
  );
}
