import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getChurchContext } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import { InviteForm } from './invite-form';

export default async function InvitePage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const canInviteStaff = session.profile?.role === 'church_admin' || Boolean(session.profile?.is_platform_admin);

  const supabase = await createServerSupabaseClient();
  const [church, campusesResult] = await Promise.all([
    churchId ? getChurchContext(churchId) : Promise.resolve(null),
    churchId
      ? supabase.from('campuses').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name')
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/people" className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
          <ChevronLeft className="h-3 w-3" />
          People
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Invite someone</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          {canInviteStaff
            ? 'Invite a member who already belongs here, or someone joining your team.'
            : 'Invite a member who already belongs here. A church admin invites staff.'}{' '}
          Bringing in many people at once? Use{' '}
          <Link href="/people/import" className="text-primary hover:underline">
            import
          </Link>
          .
        </p>
      </div>
      <InviteForm
        campuses={(campusesResult.data ?? []) as Array<{ id: string; name: string }>}
        canInviteStaff={canInviteStaff}
        connectName={church ? connectName(church) : 'your church'}
      />
    </div>
  );
}
