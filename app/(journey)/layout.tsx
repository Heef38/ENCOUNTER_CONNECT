import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/auth/sign-out-button';

interface Branding {
  church: { name: string; logo_url: string | null; brand_color: string | null } | null;
  campus: { name: string; brand_color: string | null } | null;
}

export default async function JourneyLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();

  // Participant-only shell. Staff/platform users are bounced to their dashboard
  // (mirrors the per-page guard the journey screens used previously).
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  if (isPlatform || (role && role !== 'participant')) {
    redirect('/dashboard');
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('participants')
    .select(
      `church:churches(name, logo_url, brand_color),
       campus:campuses(name, brand_color)`,
    )
    .eq('profile_id', session.id)
    .maybeSingle();

  const branding = (data as unknown as Branding | null) ?? null;
  const church = branding?.church ?? null;
  const campus = branding?.campus ?? null;
  const accent = campus?.brand_color ?? church?.brand_color ?? null;

  return (
    <div
      className="min-h-[100dvh] bg-background"
      style={accent ? ({ ['--journey-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {church?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={church.logo_url}
                alt={church.name}
                className="h-7 w-auto"
              />
            ) : (
              <span className="truncate font-display text-sm font-semibold text-foreground">
                {church?.name ?? 'Encounter Connect'}
              </span>
            )}
            {campus?.name && (
              <span className="truncate text-xs text-foreground-subtle">
                {campus.name}
              </span>
            )}
          </div>
          <SignOutButton />
        </header>

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
