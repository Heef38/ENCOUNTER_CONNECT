import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deleteTeam, updateTeam } from '@/lib/connector-teams/actions';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { TeamForm } from '../team-form';
import { loadCampuses, loadConnectorOptions } from '../options';

export default async function EditConnectorTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const { id } = await params;

  const supabase = await createServerSupabaseClient();

  const { data: team } = await supabase
    .from('connector_teams')
    .select('id, church_id, name, campus_id, is_active')
    .eq('id', id)
    .maybeSingle();
  if (!team || team.church_id !== churchId) notFound();

  const [{ data: memberRows }, campuses, connectors] = await Promise.all([
    supabase.from('connector_team_members').select('connector_id').eq('team_id', id),
    loadCampuses(supabase, churchId!),
    loadConnectorOptions(supabase, churchId!, id),
  ]);
  const memberIds = (memberRows ?? []).map(
    (m) => (m as { connector_id: string }).connector_id,
  );

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return updateTeam(id, formData);
  }

  async function remove() {
    'use server';
    await deleteTeam(id);
    redirect('/connectors/teams');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/connectors/teams"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Teams
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {team.name as string}
        </h1>
      </div>

      <TeamForm
        campuses={campuses}
        connectors={connectors}
        defaults={{
          name: team.name as string,
          campusId: (team.campus_id as string | null) ?? null,
          memberA: memberIds[0],
          memberB: memberIds[1],
          isActive: team.is_active as boolean,
        }}
        action={action}
        submitLabel="Save changes"
        showActive
      />

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Disband team</p>
        <p className="mt-1 mb-3 text-sm text-foreground-muted">
          Removes the team and its shared calendar. Both connectors revert to
          scheduling on their own again.
        </p>
        <ConfirmDeleteButton
          action={remove}
          label="Disband team"
          message="Disband this team? The shared calendar is deleted and both connectors go back to individual scheduling. This cannot be undone."
        />
      </div>
    </div>
  );
}
