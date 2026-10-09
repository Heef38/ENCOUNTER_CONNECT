'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { acceptInvite, type AcceptResult } from '@/lib/invites/actions';
import { signOutAction } from '@/lib/auth/actions';

interface Props {
  code: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  needsPhone: boolean;
  mode: 'new' | 'existing' | 'signed_in' | 'wrong_account';
  signedInEmail: string | null;
}

export function AcceptInviteForm({ code, email, firstName, lastName, phone, needsPhone, mode, signedInEmail }: Props) {
  const [state, action, pending] = useActionState<AcceptResult | null, FormData>(acceptInvite.bind(null, code), null);

  if (mode === 'wrong_account') {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-foreground-muted">
          You&apos;re signed in as <span className="font-medium text-foreground">{signedInEmail}</span>, and this invite is for{' '}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out, then open the link again
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <p className="text-xs text-foreground-subtle">
        For <span className="font-medium text-foreground">{email}</span>
      </p>

      {mode === 'new' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" required defaultValue={firstName} autoComplete="given-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" required defaultValue={lastName} autoComplete="family-name" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Choose a password</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
            <p className="text-xs text-foreground-subtle">At least 8 characters.</p>
          </div>
        </>
      )}

      {mode === 'existing' && (
        <div className="space-y-1.5">
          <Label htmlFor="password">You already have an account. Enter your password</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
          <p className="text-xs text-foreground-subtle">
            Forgot it? Get a sign-in link from the <Link href="/" className="text-primary hover:underline">front page</Link>, then open
            this invite again.
          </p>
        </div>
      )}

      {mode !== 'existing' && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="phone">
              Mobile number {needsPhone ? null : <span className="text-foreground-subtle">(optional)</span>}
            </Label>
            <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={phone} required={needsPhone} />
          </div>
          <label className="flex items-start gap-2.5 rounded-md border border-border bg-surface-muted/40 p-3 text-xs leading-relaxed text-foreground-muted">
            <input name="sms_consent" type="checkbox" className="mt-0.5 h-4 w-4 flex-none rounded border-border accent-primary" />
            <span>
              I agree to receive recurring automated text messages from my church at the number above. Msg frequency varies.
              Msg &amp; data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a condition of joining. See the{' '}
              <Link href="/privacy" className="text-primary hover:underline" target="_blank">Privacy Policy</Link> and{' '}
              <Link href="/terms" className="text-primary hover:underline" target="_blank">Terms</Link>.
            </span>
          </label>
        </>
      )}

      {state && !state.ok && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Joining…' : mode === 'new' ? 'Create my account' : 'Accept invite'}
      </Button>
    </form>
  );
}
