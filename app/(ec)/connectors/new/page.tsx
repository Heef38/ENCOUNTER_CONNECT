import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createConnector } from '@/lib/connectors/actions';
import { ConnectorForm } from '../connector-form';

export default async function NewConnectorPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const supabase = await createServerSupabaseClient();

  const [profilesResult, existingResult, campusesResult, resourcesResult] = await Promise.all([
    churchId
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .eq('church_id', churchId)
          .neq('role', 'participant')
          .order('first_name')
      : Promise.resolve({ data: [] }),
    supabase.from('connectors').select('profile_id'),
    supabase
      .from('campuses')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('scheduling_resources')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ]);

  const taken = new Set(
    (existingResult.data ?? []).map((c) => c.profile_id as string),
  );
  const profiles = (profilesResult.data ?? []).filter(
    (p) => !taken.has(p.id),
  ) as { id: string; first_name: string; last_name: string; email: string | null }[];

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createConnector(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/connectors"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Connectors
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New connector
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Promote an existing staff profile to a connector. Add new people via Settings → Profiles first if they aren&apos;t in the system yet.
        </p>
      </div>

      <ConnectorForm
        profiles={profiles}
        campuses={campusesResult.data ?? []}
        resources={resourcesResult.data ?? []}
        action={action}
        submitLabel="Create connector"
        redirectOnSuccess="/connectors"
      />
    </div>
  );
}
