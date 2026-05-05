import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateChurch, deactivateChurch } from '@/lib/church/church-actions';
import { ChurchForm } from '../church-form';
import type { Church } from '@/lib/church/types';

export default async function EditChurchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('churches')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();
  const church = data as Church;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateChurch(id, formData);
  }
  async function destroy() {
    'use server';
    await deactivateChurch(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/platform/churches"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Churches
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {church.name}
          </h1>
        </div>
        {church.is_active && (
          <ConfirmDeleteButton
            action={destroy}
            label="Deactivate"
            message="Deactivate this church? Existing data is preserved; users in the church will lose access until reactivated."
          />
        )}
      </div>

      <ChurchForm
        church={church}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/platform/churches"
      />
    </div>
  );
}
