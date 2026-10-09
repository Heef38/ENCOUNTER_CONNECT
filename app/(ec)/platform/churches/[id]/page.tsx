import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateChurch, deactivateChurch } from '@/lib/church/church-actions';
import { setChurchVerified } from '@/lib/church/settings-actions';
import { Button } from '@/components/ui/button';
import { connectName } from '@/lib/brand';
import { listPendingInvites } from '@/lib/invites/queries';
import { PendingInvites } from '@/components/invites/pending-invites';
import { FirstAdminInvite } from './first-admin-invite';
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
  const church = data as Church & {
    verified_at?: string | null;
    listed_on_map?: boolean;
    connect_name?: string | null;
    is_test?: boolean;
  };
  const verified = Boolean(church.verified_at);
  const invites = await listPendingInvites(id);

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateChurch(id, formData);
  }
  async function toggleVerified() {
    'use server';
    await setChurchVerified(id, !verified);
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

      <form action={toggleVerified} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="text-sm">
          <p className="font-medium text-foreground">{verified ? 'Verified church' : 'Not verified yet'}</p>
          <p className="text-xs text-foreground-muted">
            {church.listed_on_map ? 'They chose to be on the shared map.' : 'They have not chosen to be on the shared map.'}{' '}
            Only verified churches that chose it get a pin.{church.is_test ? ' This is the test church, which is never verified.' : ''}
          </p>
        </div>
        <Button type="submit" size="md" variant={verified ? 'outline' : 'primary'} disabled={church.is_test}>
          {verified ? 'Remove verification' : 'Verify this church'}
        </Button>
      </form>

      <FirstAdminInvite churchId={id} connectName={connectName(church)} />
      <PendingInvites invites={invites} canManageStaff />

      <ChurchForm
        church={church}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/platform/churches"
      />
    </div>
  );
}
