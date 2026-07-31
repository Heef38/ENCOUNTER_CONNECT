'use client';

import { useActionState, useState } from 'react';
import {
  signInAction,
  sendMagicLinkAction,
  type SignInState,
  type MagicLinkState,
} from '@/lib/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [state, action, pending] = useActionState<SignInState | undefined, FormData>(
    signInAction,
    undefined,
  );
  const [magicState, magicAction, magicPending] = useActionState<
    MagicLinkState | undefined,
    FormData
  >(sendMagicLinkAction, undefined);

  if (mode === 'magic') {
    return (
      <form action={magicAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        {magicState?.sent ? (
          <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">
            If that email has an account, a sign-in link is on its way. Check
            your inbox.
          </p>
        ) : null}

        {magicState?.error && (
          <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            {magicState.error}
          </p>
        )}

        <Button type="submit" disabled={magicPending} className="w-full" size="lg">
          {magicPending ? 'Sending…' : 'Email me a sign-in link'}
        </Button>

        <button
          type="button"
          onClick={() => setMode('password')}
          className="w-full text-center text-sm text-foreground-muted hover:text-foreground"
        >
          Use a password instead
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? 'Signing in…' : 'Welcome back'}
      </Button>

      <button
        type="button"
        onClick={() => setMode('magic')}
        className="w-full text-center text-sm text-foreground-muted hover:text-foreground"
      >
        Email me a sign-in link instead
      </button>
    </form>
  );
}
