'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  changeMyEmail,
  changeMyPassword,
  deleteMyAccount,
  updateMyDetails,
  type AccountResult,
} from '@/lib/account/actions';

function Status({ state }: { state: AccountResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="text-sm text-success">{state.message}</p>
  ) : (
    <p className="text-sm text-danger">{state.error}</p>
  );
}

export function DetailsForm({
  firstName,
  lastName,
  phone,
  texts,
  churchName,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  texts: boolean;
  churchName: string;
}) {
  const [state, action, pending] = useActionState<AccountResult | null, FormData>(updateMyDetails, null);
  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-4">
          <h2 className="font-display text-lg font-medium text-foreground">You</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="first_name">First name</Label>
              <Input id="first_name" name="first_name" defaultValue={firstName} required autoComplete="given-name" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="last_name">Last name</Label>
              <Input id="last_name" name="last_name" defaultValue={lastName} required autoComplete="family-name" className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="phone">Mobile number</Label>
            <Input id="phone" name="phone" type="tel" defaultValue={phone} autoComplete="tel" className="mt-1" />
          </div>
          <label className="flex items-start gap-2.5 rounded-md border border-border bg-surface-muted/40 p-3 text-xs leading-relaxed text-foreground-muted">
            <input name="sms_consent" type="checkbox" defaultChecked={texts} className="mt-0.5 h-4 w-4 flex-none accent-primary" />
            <span>
              Text me at this number about my meetings, gatherings I&apos;m part of, and next steps from {churchName}. Msg frequency
              varies. Msg &amp; data rates may apply. Reply STOP to stop, HELP for help. You can turn this off here any time.
            </span>
          </label>
          <Status state={state} />
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AccountResult | null, FormData>(changeMyEmail, null);
  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-3">
          <h2 className="font-display text-lg font-medium text-foreground">Email</h2>
          <p className="text-sm text-foreground-muted">
            You sign in with <span className="font-medium text-foreground">{email}</span>.
          </p>
          <div>
            <Label htmlFor="email">New email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" className="mt-1" />
          </div>
          <Status state={state} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Sending…' : 'Change email'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<AccountResult | null, FormData>(changeMyPassword, null);
  return (
    <Card>
      <CardContent className="p-5">
        <form action={action} className="space-y-3">
          <h2 className="font-display text-lg font-medium text-foreground">Password</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="confirm">Type it again</Label>
              <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" className="mt-1" />
            </div>
          </div>
          <Status state={state} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function DeleteAccountForm({ isStaff, churchName }: { isStaff: boolean; churchName: string }) {
  const [state, action, pending] = useActionState<AccountResult | null, FormData>(deleteMyAccount, null);
  return (
    <Card className="border-danger/40">
      <CardContent className="p-5">
        <form action={action} className="space-y-3">
          <h2 className="font-display text-lg font-medium text-foreground">Delete my account</h2>
          {isStaff ? (
            <p className="text-sm text-foreground-muted">
              You&apos;re on {churchName}&apos;s staff. Ask a church admin to change your role first, so the people and schedules you
              look after are handed on. Then you can delete your account here.
            </p>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground-muted">
                <li>Your login is removed, along with your groups, RSVPs and lesson progress.</li>
                <li>Gatherings you were going to host are cancelled, and the people coming are told.</li>
                <li>
                  {churchName} keeps its records of its ministry with you, such as notes from conversations, with your name and
                  contact details taken off.
                </li>
                <li>This can&apos;t be undone.</li>
              </ul>
              <p className="text-xs text-foreground-subtle">
                See the <Link href="/privacy" className="text-primary hover:underline">privacy policy</Link> for what is kept and why.
              </p>
              <div>
                <Label htmlFor="confirm_delete">Type delete to confirm</Label>
                <Input id="confirm_delete" name="confirm" autoComplete="off" className="mt-1" />
              </div>
              <Status state={state} />
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? 'Deleting…' : 'Delete my account'}
              </Button>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
