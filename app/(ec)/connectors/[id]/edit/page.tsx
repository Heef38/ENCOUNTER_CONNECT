import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateConnector, deleteConnector } from '@/lib/connectors/actions';
import { getConnector } from '@/lib/connectors/services';
import { ConnectorForm } from '../../connector-form';

export default async function EditConnectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const [connectorResult, campusesResult, resourcesResult] = await Promise.all([
    getConnector(supabase, id),
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

  if (!connectorResult.success) notFound();
  const connector = connectorResult.data;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateConnector(id, formData);
  }
  async function destroy() {
    'use server';
    await deleteConnector(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/connectors/${id}`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            {connector.profile.first_name} {connector.profile.last_name}
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit connector
          </h1>
        </div>
        <ConfirmDeleteButton
          action={destroy}
          message="Remove this connector? Participants assigned to them will be unassigned."
          label="Remove connector"
        />
      </div>

      <ConnectorForm
        currentProfile={{
          id: connector.profile_id,
          first_name: connector.profile.first_name,
          last_name: connector.profile.last_name,
          email: connector.profile.email,
        }}
        campuses={campusesResult.data ?? []}
        resources={resourcesResult.data ?? []}
        defaults={{
          campus_id: connector.campus_id,
          scheduling_resource_id: connector.scheduling_resource_id,
          is_active: connector.is_active,
        }}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess={`/connectors/${id}`}
      />
    </div>
  );
}
