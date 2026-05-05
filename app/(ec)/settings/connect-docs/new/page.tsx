import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createConnectDoc } from '@/lib/connect-docs/actions';
import { ConnectDocForm } from '../connect-doc-form';

export default async function NewConnectDocPage() {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: campuses } = await supabase
    .from('campuses')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createConnectDoc(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/connect-docs"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Connect docs
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New connect doc
        </h1>
      </div>

      <ConnectDocForm
        campuses={campuses ?? []}
        action={action}
        submitLabel="Create doc"
        redirectOnSuccess="/settings/connect-docs"
      />
    </div>
  );
}
