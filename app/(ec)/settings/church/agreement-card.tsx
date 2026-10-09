'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { acceptChurchAgreement } from '@/lib/church/settings-actions';

export function AgreementCard({
  churchName,
  currentVersion,
  acceptedVersion,
  acceptedOn,
}: {
  churchName: string;
  currentVersion: string;
  acceptedVersion: string | null;
  acceptedOn: string | null;
}) {
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = acceptedVersion === currentVersion;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="font-display text-lg font-medium text-foreground">Church agreement</h2>
        <p className="text-sm text-foreground-muted">
          One page on whose information it is, what {churchName} agrees to, and what ChurchConnect agrees to.{' '}
          <Link href="/church-agreement" target="_blank" className="text-primary hover:underline">
            Read it
          </Link>
          .
        </p>
        {current ? (
          <p className="text-sm text-success">
            Accepted{acceptedOn ? ` on ${new Date(acceptedOn).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ''}.
          </p>
        ) : (
          <>
            {acceptedVersion && <p className="text-sm text-warning">The agreement has changed since your church accepted it.</p>}
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              I accept the church agreement on behalf of {churchName}.
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button
              size="sm"
              disabled={!agree || pending}
              onClick={() =>
                start(async () => {
                  const r = await acceptChurchAgreement();
                  if (r.ok) router.refresh();
                  else setError(r.error ?? 'Could not save.');
                })
              }
            >
              Accept
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
