import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { connectName, connectNameWithPlatform } from '@/lib/brand';
import { listPublicEvents } from '@/lib/events/queries';
import { formatDateInZone, formatTimeInZone } from '@/lib/time/zoned';
import { SignupForm } from './signup-form';

interface ChurchRow {
  id: string;
  name: string;
  connect_name: string | null;
  description: string | null;
  service_times: string | null;
  logo_url: string | null;
  brand_color: string | null;
  timezone: string | null;
  is_active: boolean;
  is_test: boolean;
  verified_at: string | null;
}

const loadChurch = cache(async (slug: string): Promise<ChurchRow | null> => {
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('churches')
    .select('id, name, connect_name, description, service_times, logo_url, brand_color, timezone, is_active, is_test, verified_at')
    .eq('slug', slug)
    .maybeSingle();
  const church = data as ChurchRow | null;
  return church && church.is_active ? church : null;
});

export async function generateMetadata({ params }: { params: Promise<{ church: string }> }): Promise<Metadata> {
  const { church: slug } = await params;
  const church = await loadChurch(slug);
  if (!church) return { title: 'Church', robots: { index: false } };
  // Search engines see a church once the platform has verified it, and
  // never the test church.
  const indexable = Boolean(church.verified_at) && !church.is_test;
  const description = church.description?.slice(0, 160) || `Gatherings and next steps at ${church.name}.`;
  return {
    title: { absolute: `${church.name} · ${connectNameWithPlatform(church)}` },
    description,
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      title: church.name,
      description,
      siteName: connectName(church),
      ...(church.logo_url ? { images: [{ url: church.logo_url }] } : {}),
    },
  };
}

export default async function PublicChurchLandingPage({
  params,
}: {
  params: Promise<{ church: string }>;
}) {
  const { church: slug } = await params;
  const church = await loadChurch(slug);
  if (!church) notFound();
  const timeZone = church.timezone ?? 'America/Chicago';
  const now = new Date();
  const upcoming = (
    await listPublicEvents(church.id, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 45 * 864e5).toISOString(),
    })
  )
    .filter((e) => e.status === 'published')
    .slice(0, 6);

  const accent = church.brand_color ?? null;

  return (
    <main
      className="bg-background py-12 md:py-20"
      style={accent ? ({ ['--church-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-4">
        <header className="flex flex-col items-center gap-3 text-center">
          {church.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={church.logo_url}
              alt={`${church.name} logo`}
              className="h-auto max-h-24 w-auto max-w-full object-contain"
            />
          ) : (
            // No logo on file — fall back to the church name.
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {church.name}
            </h1>
          )}
          {church.description && (
            <p className="text-sm text-foreground-muted">{church.description}</p>
          )}
          {church.service_times && (
            <p className="whitespace-pre-line text-sm font-medium text-foreground">{church.service_times}</p>
          )}
        </header>

        {upcoming.length > 0 && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-display text-lg font-semibold text-foreground">Coming up</h2>
              <ul className="space-y-2 text-sm">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link href={`/hub/e/${e.id}`} className="font-medium text-foreground hover:text-primary">
                      {e.title}
                    </Link>
                    <p className="text-xs text-foreground-muted">
                      {formatDateInZone(e.starts_at, timeZone, { weekday: 'short', month: 'short', day: 'numeric' })},{' '}
                      {formatTimeInZone(e.starts_at, timeZone)}
                      {e.location_label ? ` · ${e.location_label}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <Link href={`/?church=${slug}`} className="text-xs font-medium text-primary hover:underline">
                See everything on the map
              </Link>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Get connected
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Create an account and we&apos;ll guide you through next steps.
              </p>
            </div>
            <SignupForm churchId={church.id} campusId={null} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
