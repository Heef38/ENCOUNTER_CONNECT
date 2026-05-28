import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Map as MapIcon } from 'lucide-react';
import { requireAuth } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/auth/sign-out-button';

interface LayoutData {
  church: { name: string; logo_url: string | null; brand_color: string | null } | null;
  campus: { name: string; brand_color: string | null } | null;
  progress: { status: string }[] | null;
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
       campus:campuses(name, brand_color),
       progress:participant_progress(status)`,
    )
    .eq('profile_id', session.id)
    .maybeSingle();

  const layoutData = (data as unknown as LayoutData | null) ?? null;
  const church = layoutData?.church ?? null;
  const campus = layoutData?.campus ?? null;
  const accent = campus?.brand_color ?? church?.brand_color ?? null;

  const progress = layoutData?.progress ?? [];
  const total = progress.length;
  const done = progress.filter((p) => p.status === 'completed').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="min-h-[100dvh] overflow-x-hidden bg-background md:overflow-x-visible"
      style={accent ? ({ ['--journey-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col md:max-w-3xl">
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {church?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={church.logo_url} alt={church.name} className="h-8 w-auto" />
              ) : (
                <span className="truncate font-display text-base font-semibold text-foreground">
                  {church?.name ?? 'Encounter Connect'}
                </span>
              )}
              {campus?.name && (
                <span className="truncate text-sm text-foreground-subtle">{campus.name}</span>
              )}
            </div>
            <div className="flex flex-none items-center gap-3">
              <Link
                href="/journey/map"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted hover:text-foreground"
              >
                <MapIcon className="h-4 w-4" />
                <span>Full journey</span>
              </Link>
              <SignOutButton />
            </div>
          </div>

          {total > 0 && (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-[var(--journey-accent,var(--color-primary,#0f766e))] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </header>

        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
