import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { inviteStaff } from '@/lib/people/actions';
import { InviteStaffForm } from './invite-form';

export default async function InviteStaffPage() {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;

  const supabase = await createServerSupabaseClient();
  const campusesResult = churchId
    ? await supabase
        .from('campuses')
        .select('id, name')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name')
    : { data: [] };

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return inviteStaff(formData);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/people"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          People
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Invite staff
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Create a new admin or connector account. They can sign in immediately
          with the temporary password you set — share it with them, and they can
          change it later.
        </p>
      </div>

      <InviteStaffForm
        campuses={(campusesResult.data ?? []) as Array<{ id: string; name: string }>}
        action={action}
      />
    </div>
  );
}
