import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { SignupForm } from './signup-form';

interface ChurchRow {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  brand_color: string | null;
  is_active: boolean;
}

export default async function PublicChurchLandingPage({
  params,
}: {
  params: Promise<{ church: string }>;
}) {
  const { church: slug } = await params;
  const admin = await createServiceRoleClient();

  const { data } = await admin
    .from('churches')
    .select('id, name, description, logo_url, brand_color, is_active')
    .eq('slug', slug)
    .maybeSingle();

  const church = data as ChurchRow | null;
  if (!church || !church.is_active) notFound();

  const accent = church.brand_color ?? null;

  return (
    <main
      className="min-h-screen bg-background"
      style={accent ? ({ ['--church-accent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12">
        <header className="flex items-center gap-3">
          {church.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={church.logo_url}
              alt={`${church.name} logo`}
              className="h-12 w-12 rounded-md object-cover"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-md"
              style={{ background: accent ?? 'var(--color-primary, #0f766e)' }}
            />
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {church.name}
            </h1>
            {church.description && (
              <p className="text-sm text-foreground-muted">{church.description}</p>
            )}
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-2">
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
        </section>
      </div>
    </main>
  );
}
