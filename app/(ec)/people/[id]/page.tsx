import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Badge } from '@/components/ui/badge';
import { setProfileRole } from '@/lib/people/actions';
import { ProfileEditForm } from './profile-edit-form';
import type { ECUserRole } from '@/lib/church/types';

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: ECUserRole;
  campus_id: string | null;
  is_platform_admin: boolean;
  church_id: string | null;
}

export default async function PersonEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireChurchAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const [profileResult, campusesResult, connectorResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role, campus_id, is_platform_admin, church_id')
      .eq('id', id)
      .maybeSingle(),
    session.profile?.church_id
      ? supabase
          .from('campuses')
          .select('id, name')
          .eq('church_id', session.profile.church_id)
          .eq('is_active', true)
          .order('name')
      : Promise.resolve({ data: [] }),
    supabase
      .from('connectors')
      .select('id, is_active')
      .eq('profile_id', id)
      .maybeSingle(),
  ]);

  if (!profileResult.data) notFound();
  const profile = profileResult.data as ProfileRow;
  const connector = connectorResult.data as { id: string; is_active: boolean } | null;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return setProfileRole(id, formData);
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {profile.first_name} {profile.last_name}
          </h1>
          {profile.is_platform_admin && <Badge tone="primary">Platform admin</Badge>}
        </div>
        {profile.email && (
          <p className="mt-1 text-sm text-foreground-muted">{profile.email}</p>
        )}
      </div>

      <ProfileEditForm
        profile={{
          role: profile.role,
          campus_id: profile.campus_id,
        }}
        campuses={(campusesResult.data ?? []) as Array<{ id: string; name: string }>}
        action={update}
      />

      {connector && (
        <div className="rounded-md border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-foreground">Linked as a connector</p>
          <p className="mt-1 text-foreground-muted">
            This person also has a connector record ({connector.is_active ? 'active' : 'inactive'}).
          </p>
          <Link
            href={`/connectors/${connector.id}/edit`}
            className="mt-2 inline-block text-xs text-primary hover:underline"
          >
            Edit connector record →
          </Link>
        </div>
      )}
    </div>
  );
}
