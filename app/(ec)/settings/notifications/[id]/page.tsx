import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { updateTemplate, deleteTemplate } from '@/lib/notifications/actions';
import { TemplateForm } from '../template-form';
import type { NotificationTemplate } from '@/lib/notifications/types';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCampusAdmin();
  const { id } = await params;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!data) notFound();
  const template = data as NotificationTemplate;

  async function update(_prev: unknown, formData: FormData) {
    'use server';
    return updateTemplate(id, formData);
  }
  async function destroy() {
    'use server';
    await deleteTemplate(id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/notifications"
            className="mb-1 inline-flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Notifications
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {template.name}
          </h1>
        </div>
        <ConfirmDeleteButton
          action={destroy}
          message="Delete this template? The system will fall back to the built-in default for this key."
        />
      </div>

      <TemplateForm
        template={template}
        action={update}
        submitLabel="Save changes"
        redirectOnSuccess="/settings/notifications"
      />
    </div>
  );
}
