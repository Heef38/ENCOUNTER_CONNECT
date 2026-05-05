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
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Encounter Connect
          </h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Sign in to continue your journey.
          </p>
        </div>
        <Card>
          <CardContent className="p-6">
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
    </main>
  );
}
