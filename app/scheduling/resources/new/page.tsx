'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ResourceForm } from '@/components/scheduling/resource-form/resource-form';

export default function NewResourcePage() {
  const router = useRouter();
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/scheduling/resources" className="text-sm text-gray-500 hover:text-gray-700">
          ← Resources
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add Resource</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ResourceForm
          onSuccess={() => router.push('/scheduling/resources')}
          onCancel={() => router.push('/scheduling/resources')}
        />
      </div>
    </div>
  );
}
