import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ImportForm } from './import-form';

export default async function ImportPeoplePage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const supabase = await createServerSupabaseClient();
  const [campusesResult, prepared] = await Promise.all([
    churchId
      ? supabase.from('campuses').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name')
      : Promise.resolve({ data: [] }),
    churchId
      ? supabase
          .from('church_invites')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('role', 'participant')
          .eq('send_count', 0)
          .is('accepted_at', null)
          .is('revoked_at', null)
      : Promise.resolve({ count: 0 }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/people" className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground">
          <ChevronLeft className="h-3 w-3" />
          People
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Import people</h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Bring in the people who already belong here, or a list of guests. Running the same file again updates people
          instead of adding them twice.
        </p>
      </div>
      <ImportForm
        campuses={(campusesResult.data ?? []) as Array<{ id: string; name: string }>}
        preparedInvites={prepared.count ?? 0}
        defaultCampusId={session.profile?.role === 'campus_admin' ? (session.profile.campus_id ?? null) : null}
      />
    </div>
  );
}
