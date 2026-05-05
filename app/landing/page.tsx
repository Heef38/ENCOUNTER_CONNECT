import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, ShieldCheck, Building2, Users, Sparkles } from 'lucide-react';
import { requireAuth, getAvailablePlatforms, type AvailablePlatform } from '@/lib/auth/dal';
import { Card, CardContent } from '@/components/ui/card';

const ICONS: Record<AvailablePlatform, React.ReactNode> = {
  platform:    <ShieldCheck className="h-5 w-5" />,
  admin:       <Building2 className="h-5 w-5" />,
  connector:   <Users className="h-5 w-5" />,
  participant: <Sparkles className="h-5 w-5" />,
};

export default async function LandingChoicePage() {
  const session = await requireAuth();
  const platforms = await getAvailablePlatforms(session);

  // Single platform → straight in, no picker needed.
  if (platforms.length <= 1) {
    redirect(platforms[0]?.href ?? '/journey');
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          You wear a few hats around here. Where would you like to go?
        </p>
      </div>

      <div className="space-y-3">
        {platforms.map((p) => (
          <Link key={p.key} href={p.href}>
            <Card className="transition hover:border-primary/60 hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary/10 text-primary">
                  {ICONS[p.key]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{p.label}</p>
                  <p className="text-xs text-foreground-muted">{p.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-foreground-subtle" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
