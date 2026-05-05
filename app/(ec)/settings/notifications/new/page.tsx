import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createTemplate } from '@/lib/notifications/actions';
import { TemplateForm } from '../template-form';

export default async function NewTemplatePage() {
  await requireCampusAdmin();

  async function action(_prev: unknown, formData: FormData) {
    'use server';
    return createTemplate(formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/settings/notifications"
          className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Notifications
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          New template
        </h1>
      </div>

      <TemplateForm
        action={action}
        submitLabel="Create template"
        redirectOnSuccess="/settings/notifications"
      />
    </div>
  );
}
