import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requirePlatformAdmin } from '@/lib/auth/dal';
import { createChurch } from '@/lib/church/church-actions';
import { ChurchForm } from '../church-form';

export default async function NewChurchPage() {
  await requirePlatformAdmin();

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createChurch(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/platform/churches"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Churches
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New church
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">
          Provision a new tenant. You&apos;ll need to add the first church admin separately
          via Supabase Auth (no email-invite flow yet).
        </p>
      </div>

      <ChurchForm
        action={action}
        submitLabel="Create church"
        redirectOnSuccess="/platform/churches"
      />
    </div>
  );
}
