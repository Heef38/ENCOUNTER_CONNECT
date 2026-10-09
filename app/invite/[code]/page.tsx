import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { connectName, PLATFORM_NAME } from '@/lib/brand';
import { getInvitePage } from '@/lib/invites/queries';
import { rolePhrase } from '@/lib/invites/types';
import { AcceptInviteForm } from './accept-form';

export const metadata: Metadata = {
  title: 'Your invite',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function Brand({ church }: { church: { name: string; connect_name: string | null; logo_url: string | null } }) {
  return (
    <header className="flex flex-col items-center gap-2 text-center">
      {church.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={church.logo_url} alt={`${church.name} logo`} className="h-auto max-h-20 w-auto max-w-full object-contain" />
      ) : null}
      <p className="font-display text-xl font-semibold tracking-tight text-foreground">{connectName(church)}</p>
      <p className="text-xs text-foreground-subtle">through {PLATFORM_NAME}</p>
    </header>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await getInvitePage(code);

  if ('error' in result) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
        {result.church && <Brand church={result.church} />}
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="text-sm text-foreground">{result.error}</p>
            <Link href="/" className="text-sm text-primary hover:underline">
              Go to the front page
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { invite, church, campusName, inviterName, hasAccount, signedInEmail } = result.data;
  const staff = invite.role !== 'participant';

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <Brand church={church} />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {invite.first_name ? `Welcome, ${invite.first_name}` : 'You’re invited'}
            </h1>
            <p className="text-sm text-foreground-muted">
              {inviterName ? `${inviterName} invited you` : 'You’ve been invited'} to join {church.name} {rolePhrase(invite.role)}
              {campusName ? ` at the ${campusName} campus` : ''}.
            </p>
          </div>
          <AcceptInviteForm
            code={code}
            email={invite.email}
            firstName={invite.first_name ?? ''}
            lastName={invite.last_name ?? ''}
            phone={invite.phone ?? ''}
            needsPhone={staff}
            mode={signedInEmail === invite.email ? 'signed_in' : signedInEmail ? 'wrong_account' : hasAccount ? 'existing' : 'new'}
            signedInEmail={signedInEmail}
          />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-foreground-subtle">
        <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
      </p>
    </main>
  );
}
