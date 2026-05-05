import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateConnectDoc, deleteConnectDoc } from '@/lib/connect-docs/actions';
import { ConnectDocForm } from '../connect-doc-form';
import type { ConnectDoc } from '@/lib/connect-docs/types';

export default async function EditConnectDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const [docResult, campusesResult] = await Promise.all([
    supabase.from('connect_docs').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('campuses')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ]);

  if (!docResult.data) notFound();
  const doc = docResult.data as ConnectDoc;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateConnectDoc(id, formData);
  }
  async function destroy() {
    'use server';
    await deleteConnectDoc(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/connect-docs"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Connect docs
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit connect doc
          </h1>
        </div>
        <ConfirmDeleteButton action={destroy} message="Delete this connect doc?" />
      </div>

      <ConnectDocForm
        doc={doc}
        campuses={campusesResult.data ?? []}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/settings/connect-docs"
      />
    </div>
  );
}
