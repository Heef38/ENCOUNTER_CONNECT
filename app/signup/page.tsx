import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { getSession, landingForSession } from '@/lib/auth/dal';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';

interface ChurchRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  logo_url: string | null;
}

export default async function SignupChurchPickerPage() {
  // Already signed in? Send them home.
  const session = await getSession();
  if (session) redirect(await landingForSession(session));

  // Anonymous visitors can't read churches via RLS, so use service-role.
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('churches')
    .select('id, name, slug, description, logo_url')
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('name');
  const churches = (data ?? []) as ChurchRow[];

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" />
        Sign in instead
      </Link>

      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Sign up
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Pick the church you&apos;re connecting with. We&apos;ll take you to their
          signup page.
        </p>
      </div>

      {churches.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-10 text-center">
            <p className="text-sm text-foreground-muted">
              No churches are accepting signups yet. Reach out to your campus
              team for an invite link.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {churches.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`}>
                <Card className="transition hover:border-primary/60 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    {c.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.logo_url}
                        alt={`${c.name} logo`}
                        className="h-10 w-10 flex-none rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {c.name}
                      </p>
                      {c.description && (
                        <p className="truncate text-xs text-foreground-muted">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-foreground-subtle" />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
