import { redirect } from 'next/navigation';
import { getSession, landingForSession } from '@/lib/auth/dal';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent } from '@/components/ui/card';

export default async function LandingPage() {
  const session = await getSession();
  if (session) {
    redirect(await landingForSession(session));
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-background">
      {/* Ambient hero glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,184,166,0.18),transparent_70%)]"
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
        {/* Hero */}
        <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/EC.png"
            alt="Encounter Connect"
            className="h-auto w-80 object-contain md:w-100"
          />

          <h1 className="mt-8 max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Connect people to God, community, and next steps.
          </h1>

          <p className="mt-5 max-w-lg text-base text-foreground-muted md:text-lg">
            Encounter Connect helps churches walk every new face through a personal
            journey — assessments, lessons, and a real connector — without anyone
            slipping through the cracks.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground-subtle lg:justify-start">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Guided journeys
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Auto-matched connectors
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Built for multi-campus
            </span>
          </div>
        </section>

        {/* Auth */}
        <section className="w-full">
          <div className="mx-auto w-full max-w-sm lg:ml-auto lg:mr-0">
            <Card>
              <CardContent className="p-6">
                <div className="mb-5">
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Welcome back
                  </h2>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Sign in to continue your journey.
                  </p>
                </div>
                <LoginForm />
              </CardContent>
            </Card>
            <p className="mt-6 text-center text-sm text-foreground-muted">
              New here?{' '}
              <a href="/signup" className="font-medium text-primary hover:underline">
                Create an account
              </a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
