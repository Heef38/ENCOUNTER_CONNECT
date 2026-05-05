'use client';

interface ResourceSelectorProps {
  resources: { id: string; name: string }[];
  selectedId: string;
}

export function ResourceSelector({ resources, selectedId }: ResourceSelectorProps) {
  return (
    <form method="GET">
      <select
        name="resource_id"
        defaultValue={selectedId}
        onChange={(e) => (e.target.closest('form') as HTMLFormElement)?.submit()}
        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {resources.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </form>
  );
}
