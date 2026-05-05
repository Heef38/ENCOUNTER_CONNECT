import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateServeTeam, deleteServeTeam } from '@/lib/serve-teams/actions';
import { ServeTeamForm } from '../serve-team-form';
import type { ServeTeam } from '@/lib/serve-teams/types';

export default async function EditServeTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const churchId = session.profile?.church_id;

  const [teamResult, campusesResult, leadersResult] = await Promise.all([
    supabase.from('serve_teams').select('*').eq('id', id).maybeSingle(),
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

  if (!teamResult.data) notFound();
  const team = teamResult.data as ServeTeam;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateServeTeam(id, formData);
  }
  async function destroy() {
    'use server';
    await deleteServeTeam(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/serve-teams"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Serve teams
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit serve team
          </h1>
        </div>
        <ConfirmDeleteButton action={destroy} message="Delete this serve team?" />
      </div>

      <ServeTeamForm
        team={team}
        campuses={campusesResult.data ?? []}
        leaders={leadersResult.data ?? []}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/settings/serve-teams"
      />
    </div>
  );
}
