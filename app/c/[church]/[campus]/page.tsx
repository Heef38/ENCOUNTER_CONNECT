import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { SignupForm } from '../signup-form';

interface ChurchRow {
  id: string;
  name: string;
  logo_url: string | null;
  brand_color: string | null;
  is_active: boolean;
}

interface CampusRow {
  id: string;
  name: string;
  church_id: string;
  is_active: boolean;
  hero_image_url: string | null;
  intro_text: string | null;
  body: string | null;
  brand_color: string | null;
}

export default async function PublicCampusLandingPage({
  params,
}: {
  params: Promise<{ church: string; campus: string }>;
}) {
  const { church: churchSlug, campus: campusSlug } = await params;
  const admin = await createServiceRoleClient();

  const { data: churchData } = await admin
    .from('churches')
    .select('id, name, logo_url, brand_color, is_active')
    .eq('slug', churchSlug)
    .maybeSingle();

  const church = churchData as ChurchRow | null;
  if (!church || !church.is_active) notFound();

  const { data: campusData } = await admin
    .from('campuses')
    .select('id, name, church_id, is_active, hero_image_url, intro_text, body, brand_color')
    .eq('church_id', church.id)
    .eq('slug', campusSlug)
    .maybeSingle();

  const campus = campusData as CampusRow | null;
  if (!campus || !campus.is_active) notFound();

  // Campus brand color wins; fall back to church.
  const accent = campus.brand_color ?? church.brand_color ?? null;

  return (
    <main
      className="min-h-screen bg-background"
      style={accent ? ({ ['--church-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-8 flex items-center gap-3">
          {church.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={church.logo_url}
              alt={`${church.name} logo`}
              className="h-10 w-10 rounded-md object-cover"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-md"
              style={{ background: accent ?? 'var(--color-primary, #0f766e)' }}
            />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              {church.name}
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {campus.name}
            </h1>
          </div>
        </header>

        {campus.hero_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campus.hero_image_url}
            alt={`${campus.name} hero`}
            className="mb-6 h-56 w-full rounded-lg object-cover"
          />
        )}

        {campus.intro_text && (
          <p className="mb-6 text-lg text-foreground">{campus.intro_text}</p>
        )}

        {campus.body && (
          <div className="mb-8 whitespace-pre-wrap rounded-lg border border-border bg-surface p-5 text-sm leading-relaxed text-foreground-muted">
            {campus.body}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Get started with {campus.name}
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Create an account and we&apos;ll guide you through next steps.
              </p>
            </div>
            <SignupForm
              churchId={church.id}
              campusId={campus.id}
              campusLabel={campus.name}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
