'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewParticipantForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const body = {
      first_name: form.get('first_name') as string,
      last_name:  form.get('last_name') as string,
      email:      form.get('email') as string || undefined,
      phone:      form.get('phone') as string || undefined,
      notes:      form.get('notes') as string || undefined,
    };

    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.');
      } else {
        router.push(`/participants/${json.id}`);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="first_name">
            First name <span className="text-danger">*</span>
          </Label>
          <Input id="first_name" name="first_name" required autoFocus />
        </div>
        <div>
          <Label htmlFor="last_name">
            Last name <span className="text-danger">*</span>
          </Label>
          <Input id="last_name" name="last_name" required />
        </div>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>

      <div>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add Participant'}
        </Button>
        <Link href="/participants">
          <Button type="button" variant="outline">Cancel</Button>
        </Link>
      </div>
    </form>
  );
}
