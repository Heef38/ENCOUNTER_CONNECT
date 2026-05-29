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
        </header>

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
