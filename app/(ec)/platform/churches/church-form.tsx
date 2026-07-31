'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Church } from '@/lib/church/types';
import type { ActionResult } from '@/lib/church/church-actions';

interface Props {
  church?: Church;
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function ChurchForm({
  church,
  action,
  submitLabel,
  redirectOnSuccess,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (prev, formData) => {
      const result = await action(prev, formData);
      if (result.ok && redirectOnSuccess) {
        router.push(redirectOnSuccess);
        router.refresh();
      }
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-display text-base font-semibold text-foreground">Basics</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Church name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={church?.name ?? ''}
              placeholder="First Community Church"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={church?.slug ?? ''}
              placeholder="auto-generated"
              className="font-mono text-xs"
            />
            <p className="text-xs text-foreground-subtle">
              Reserved for future subdomain routing.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone"
              name="timezone"
              defaultValue={church?.timezone ?? 'America/Chicago'}
              placeholder="America/Chicago"
            />
          </div>
          {church && (
            <div className="flex items-end gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={church.is_active}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={church?.description ?? ''}
            placeholder="Internal note shown on the platform admin views."
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-base font-semibold text-foreground">Branding</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="logo_file">Upload logo</Label>
            <Input
              id="logo_file"
              name="logo_file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="h-auto py-1.5"
            />
            <p className="text-xs text-foreground-subtle">
              Stored on the platform; takes priority over the URL field.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logo_url">…or logo URL</Label>
            <Input
              id="logo_url"
              name="logo_url"
              type="url"
              defaultValue={church?.logo_url ?? ''}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand_color">Brand color</Label>
            <Input
              id="brand_color"
              name="brand_color"
              defaultValue={church?.brand_color ?? ''}
              placeholder="#0f766e"
              className="font-mono text-xs"
            />
            <p className="text-xs text-foreground-subtle">
              Hex value. Campuses can override.
            </p>
          </div>
        </div>
      </section>

      {state && !state.ok && state.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
