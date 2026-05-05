import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { promoteProfile } from '@/lib/people/actions';
import { PromoteForm } from './promote-form';
import type { ECUserRole } from '@/lib/church/types';

const ALLOWED_ROLES = new Set<ECUserRole>(['church_admin', 'campus_admin']);

const TITLES: Record<string, string> = {
  church_admin: 'Add church admin',
  campus_admin: 'Add campus admin',
};

const HINTS: Record<string, string> = {
  church_admin: 'Promote an existing person to a church-wide admin. They must already have signed up.',
  campus_admin: 'Promote an existing person to a campus admin. They must already have signed up.',
};

export default async function PromotePersonPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await requireChurchAdmin();
  const params = await searchParams;
  const targetRole = (params.role ?? 'church_admin') as ECUserRole;

  if (!ALLOWED_ROLES.has(targetRole)) {
    return (
      <div className="mx-auto max-w-md py-12 text-center text-sm text-foreground-muted">
        Unsupported role.
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();
  const churchId = session.profile?.church_id;

  const [profilesResult, campusesResult] = await Promise.all([
    churchId
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email, role')
          .eq('church_id', churchId)
          .neq('role', targetRole)
          .order('first_name')
      : Promise.resolve({ data: [] }),
    churchId
      ? supabase
          .from('campuses')
          .select('id, name')
          .eq('church_id', churchId)
          .eq('is_active', true)
          .order('name')
      : Promise.resolve({ data: [] }),
  ]);

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    formData.set('role', targetRole);
    return promoteProfile(formData);
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
          {TITLES[targetRole]}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">{HINTS[targetRole]}</p>
      </div>

      <PromoteForm
        profiles={(profilesResult.data ?? []) as Array<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          role: ECUserRole;
        }>}
        campuses={(campusesResult.data ?? []) as Array<{ id: string; name: string }>}
        requireCampus={targetRole === 'campus_admin'}
        action={action}
      />
    </div>
  );
}
