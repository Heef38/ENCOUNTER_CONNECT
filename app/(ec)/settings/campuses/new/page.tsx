import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createCampus } from '@/lib/church/campus-actions';
import { CampusForm } from '../campus-form';

export default async function NewCampusPage() {
  await requireCampusAdmin();

  const supabase = await createServerSupabaseClient();
  const { data: locations } = await supabase
    .from('scheduling_locations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createCampus(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/campuses"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Campuses
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New campus
        </h1>
      </div>

      <CampusForm
        schedulingLocations={locations ?? []}
        action={action}
        submitLabel="Create campus"
        redirectOnSuccess="/settings/campuses"
      />
    </div>
  );
}
