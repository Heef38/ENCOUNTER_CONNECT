import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServeTeam } from '@/lib/serve-teams/actions';
import { ServeTeamForm } from '../serve-team-form';

export default async function NewServeTeamPage() {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();

  const churchId = session.profile?.church_id;
  const [campusesResult, leadersResult] = await Promise.all([
    supabase
      .from('campuses')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    churchId
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .eq('church_id', churchId)
          .in('role', ['church_admin', 'campus_admin', 'connector'])
          .order('first_name')
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ]);

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createServeTeam(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/serve-teams"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Serve teams
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New serve team
        </h1>
      </div>

      <ServeTeamForm
        campuses={campusesResult.data ?? []}
        leaders={leadersResult.data ?? []}
        action={action}
        submitLabel="Create team"
        redirectOnSuccess="/settings/serve-teams"
      />
    </div>
  );
}
