'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import type { SchedulingResource } from '@/lib/scheduling/types';
import { ResourceForm } from '@/components/scheduling/resource-form/resource-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditResourcePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [resource, setResource] = useState<SchedulingResource | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/scheduling/resources/${id}`)
      .then((r) => r.json())
      .then((j) => { setResource(j.data); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (!resource) return <div className="p-8 text-sm text-red-500">Resource not found.</div>;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/scheduling/resources" className="text-sm text-gray-500 hover:text-gray-700">
          ← Resources
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Edit Resource</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ResourceForm
          resource={resource}
          onSuccess={() => router.push('/scheduling/resources')}
          onCancel={() => router.push('/scheduling/resources')}
        />
      </div>
    </div>
  );
}
