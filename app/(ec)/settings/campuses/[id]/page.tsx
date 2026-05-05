import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateCampus, deleteCampus } from '@/lib/church/campus-actions';
import { CampusForm } from '../campus-form';
import type { Campus } from '@/lib/church/types';

export default async function EditCampusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const [campusResult, locationsResult] = await Promise.all([
    supabase.from('campuses').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('scheduling_locations')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ]);

  if (!campusResult.data) notFound();
  const campus = campusResult.data as Campus;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateCampus(id, formData);
  }
  async function destroy() {
    'use server';
    await deleteCampus(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/campuses"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Campuses
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit campus
          </h1>
        </div>
        <ConfirmDeleteButton
          action={destroy}
          message="Delete this campus? Serve teams and connect docs assigned to it will become unassigned."
        />
      </div>

      <CampusForm
        campus={campus}
        schedulingLocations={locationsResult.data ?? []}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/settings/campuses"
      />
    </div>
  );
}
