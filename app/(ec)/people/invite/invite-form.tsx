'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ECUserRole } from '@/lib/church/types';
import type { ActionResult } from '@/lib/people/actions';

interface CampusOption {
  id: string;
  name: string;
}

interface Props {
  campuses: CampusOption[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}

const ROLE_OPTIONS: Array<{ value: ECUserRole; label: string; hint: string }> = [
  { value: 'church_admin', label: 'Church admin', hint: 'Full access across the whole church.' },
  { value: 'campus_admin', label: 'Campus admin', hint: 'Manages a single campus.' },
  { value: 'connector', label: 'Connector', hint: 'Guides participants through their journey.' },
];

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function InviteStaffForm({ campuses, action }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<ECUserRole>('church_admin');
  const [password, setPassword] = useState('');

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok) {
        router.push('/people');
        router.refresh();
      }
      return result;
    },
    null,
  );

  const campusRequired = role === 'campus_admin';

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="first_name">First name</Label>
          <Input id="first_name" name="first_name" required autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="last_name">Last name</Label>
          <Input id="last_name" name="last_name" required autoComplete="off" />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="off" />
      </div>

      <div>
        <Label htmlFor="phone">
          Mobile number <span className="text-danger">*</span>
        </Label>
        <Input id="phone" name="phone" type="tel" required placeholder="(555) 555-5555" />
        <p className="mt-1 text-xs text-foreground-subtle">
          Required so staff can receive operational notifications.
        </p>
      </div>

      <div>
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as ECUserRole)}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-foreground-subtle">
          {ROLE_OPTIONS.find((r) => r.value === role)?.hint}
        </p>
      </div>

      <div>
        <Label htmlFor="campus_id">
          Campus{' '}
          {campusRequired ? <span className="text-danger">*</span> : (
            <span className="text-foreground-subtle">(optional)</span>
          )}
        </Label>
        <select
          id="campus_id"
          name="campus_id"
          required={campusRequired}
          defaultValue=""
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">{campusRequired ? '— Select a campus —' : '— None —'}</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="password">Temporary password</Label>
        <div className="flex gap-2">
          <Input
            id="password"
            name="password"
            type="text"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="off"
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setPassword(generatePassword())}
            className="flex-none"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate
          </Button>
        </div>
        <p className="mt-1 text-xs text-foreground-subtle">
          Share this with the new staff member. They can sign in immediately and
          change it from their account.
        </p>
      </div>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  );
}
