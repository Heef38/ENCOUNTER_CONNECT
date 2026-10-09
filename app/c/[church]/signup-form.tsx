'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUpParticipant } from '@/lib/auth/signup-actions';

interface Props {
  churchId: string;
  campusId: string | null;
  campusLabel?: string | null;
}

export function SignupForm({ churchId, campusId, campusLabel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verifyMode, setVerifyMode] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    const firstName = String(formData.get('first_name') ?? '');
    const lastName = String(formData.get('last_name') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const phone = String(formData.get('phone') ?? '');
    const smsConsent = formData.get('sms_consent') === 'on';
    const joinedAs = formData.get('joined_as') === 'member' ? 'member' : 'guest';

    startTransition(async () => {
      const result = await signUpParticipant({
        churchId,
        campusId,
        firstName,
        lastName,
        email,
        password,
        phone,
        smsConsent,
        joinedAs,
      });

      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }

      if (result.hasSession) {
        router.push(result.joinedAs === 'member' ? '/' : '/journey');
        router.refresh();
      } else {
        setVerifyMode(true);
      }
    });
  }

  if (verifyMode) {
    return (
      <div className="rounded-md border border-success/40 bg-success-bg/40 p-4 text-sm">
        <p className="font-medium text-foreground">Check your email</p>
        <p className="mt-1 text-foreground-muted">
          We sent a confirmation link to your inbox. Click it to finish creating your
          account, then come back and sign in.
        </p>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Are you new here?</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="radio" name="joined_as" value="guest" defaultChecked className="mt-0.5 accent-primary" />
          <span>
            I&apos;m new here
            <span className="block text-xs text-foreground-muted">Someone will reach out to welcome you.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="radio" name="joined_as" value="member" className="mt-0.5 accent-primary" />
          <span>
            I already belong to this church
            <span className="block text-xs text-foreground-muted">Skip the welcome steps. An admin confirms you.</span>
          </span>
        </label>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" name="first_name" required autoComplete="given-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" required autoComplete="family-name" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-foreground-subtle">At least 8 characters.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">
          Mobile number <span className="text-foreground-subtle">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 555-5555"
        />
      </div>

      <label
        htmlFor="sms_consent"
        className="flex items-start gap-2.5 rounded-md border border-border bg-surface-muted/40 p-3 text-xs leading-relaxed text-foreground-muted"
      >
        <input
          id="sms_consent"
          name="sms_consent"
          type="checkbox"
          className="mt-0.5 h-4 w-4 flex-none rounded border-border accent-primary"
        />
        <span>
          I agree to receive recurring automated text messages (appointment reminders
          and next-step updates) at the number above. Msg frequency varies. Msg &amp;
          data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a
          condition of signing up. See our{' '}
          <Link href="/privacy" className="text-primary hover:underline" target="_blank">
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link href="/terms" className="text-primary hover:underline" target="_blank">
            Terms
          </Link>
          .
        </span>
      </label>

      {campusLabel && (
        <p className="text-xs text-foreground-subtle">
          Signing up for the <span className="font-medium text-foreground">{campusLabel}</span> campus.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-xs text-foreground-subtle">
        Already have an account?{' '}
        <Link href="/" className="text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
