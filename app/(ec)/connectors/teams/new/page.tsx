import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createTeam } from '@/lib/connector-teams/actions';
import { TeamForm } from '../team-form';
import { loadCampuses, loadConnectorOptions } from '../options';

export default async function NewConnectorTeamPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;

  const supabase = await createServerSupabaseClient();
  const [campuses, connectors] = churchId
    ? await Promise.all([
        loadCampuses(supabase, churchId),
        loadConnectorOptions(supabase, churchId),
      ])
    : [[], []];

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createTeam(formData);
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
          New team
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Pair two connectors. They&apos;ll share one schedule and both meet with
          the participants matched to the team.
        </p>
      </div>

      <TeamForm
        campuses={campuses}
        connectors={connectors}
        action={action}
        submitLabel="Create team"
      />
    </div>
  );
}
