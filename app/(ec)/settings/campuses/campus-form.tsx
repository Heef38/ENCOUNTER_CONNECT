'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Campus } from '@/lib/church/types';
import type { ActionResult } from '@/lib/church/campus-actions';

interface SchedulingLocation {
  id: string;
  name: string;
}

interface Props {
  campus?: Campus;
  schedulingLocations: SchedulingLocation[];
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  redirectOnSuccess?: string;
}

export function CampusForm({
  campus,
  schedulingLocations,
  action,
  submitLabel,
  redirectOnSuccess,
}: Props) {
  const router = useRouter();
  const [brandColor, setBrandColor] = useState(campus?.brand_color ?? '');
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
            <Label htmlFor="name">Campus name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={campus?.name ?? ''}
              placeholder="Downtown"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={campus?.slug ?? ''}
              placeholder="auto-generated"
              className="font-mono text-xs"
            />
            <p className="text-xs text-foreground-subtle">
              Used in public signup URLs (/c/&lt;church&gt;/&lt;slug&gt;).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location / address</Label>
            <Input
              id="location"
              name="location"
              defaultValue={campus?.location ?? ''}
              placeholder="123 Main St"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduling_location_id">Scheduling location</Label>
            <select
              id="scheduling_location_id"
              name="scheduling_location_id"
              defaultValue={campus?.scheduling_location_id ?? ''}
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none"
            >
              <option value="">— None —</option>
              {schedulingLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <p className="text-xs text-foreground-subtle">
              Optional. Links this campus to a scheduling location for booking flow.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={campus?.is_active ?? true}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold text-foreground">
            Participant landing page
          </h2>
          <p className="text-xs text-foreground-subtle">
            Shown above the journey for participants assigned to this campus. All fields optional.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="hero_image_url">Hero image URL</Label>
            <Input
              id="hero_image_url"
              name="hero_image_url"
              type="url"
              defaultValue={campus?.hero_image_url ?? ''}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brand_color">Journey color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick journey color"
                value={brandColor || '#0f766e'}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-12 flex-none cursor-pointer rounded border border-border bg-surface p-0.5"
              />
              <Input
                id="brand_color"
                name="brand_color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#0f766e"
                className="font-mono text-xs"
              />
              {brandColor && (
                <button
                  type="button"
                  onClick={() => setBrandColor('')}
                  className="flex-none text-xs text-foreground-subtle hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-subtle">
              Themes how the participant&apos;s journey looks — the progress bar and
              accents. Leave blank to use the church default.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="intro_text">Intro text</Label>
          <Textarea
            id="intro_text"
            name="intro_text"
            rows={2}
            defaultValue={campus?.intro_text ?? ''}
            placeholder="Welcome to Youth Connection. Your journey starts here."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="body">Body (Markdown)</Label>
          <Textarea
            id="body"
            name="body"
            rows={10}
            defaultValue={campus?.body ?? ''}
            placeholder="Long-form content for this campus's landing page…"
            className="font-mono text-xs"
          />
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
