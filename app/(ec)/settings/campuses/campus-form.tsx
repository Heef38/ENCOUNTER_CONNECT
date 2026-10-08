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
  const [accentColor, setAccentColor] = useState(campus?.accent_color ?? '');
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
            <Label htmlFor="location">Short location note (optional)</Label>
            <Input
              id="location"
              name="location"
              defaultValue={campus?.location ?? ''}
              placeholder="Downtown, next to the library"
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
          <h2 className="font-display text-base font-semibold text-foreground">Address and map pin</h2>
          <p className="text-xs text-foreground-subtle">
            The campus pin anchors your church on the map. Gatherings at the church, and every home gathering, show at
            this pin. A church building&apos;s address is public, so saving looks it up on OpenStreetMap; type exact
            coordinates instead if the pin lands in the wrong place.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address_line1">Street address</Label>
          <Input id="address_line1" name="address_line1" defaultValue={campus?.address_line1 ?? ''} autoComplete="street-address" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" defaultValue={campus?.city ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="region">State</Label>
            <Input id="region" name="region" defaultValue={campus?.region ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="postal_code">ZIP</Label>
            <Input id="postal_code" name="postal_code" defaultValue={campus?.postal_code ?? ''} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lat">Latitude (optional)</Label>
            <Input id="lat" name="lat" inputMode="decimal" defaultValue={campus?.lat ?? ''} placeholder="Found automatically" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lng">Longitude (optional)</Label>
            <Input id="lng" name="lng" inputMode="decimal" defaultValue={campus?.lng ?? ''} placeholder="Found automatically" />
          </div>
        </div>
        {campus?.lat != null && campus?.lng != null && (
          <p className="text-xs text-foreground-muted">
            Pinned at {campus.lat}, {campus.lng}.{' '}
            <a
              className="font-medium text-primary hover:underline"
              href={`https://www.openstreetmap.org/?mlat=${campus.lat}&mlon=${campus.lng}#map=17/${campus.lat}/${campus.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Check it on a map
            </a>
          </p>
        )}
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
            <Label htmlFor="brand_color">Primary color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick primary color"
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
              Buttons, progress bar, and active highlights on the journey.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accent_color">Accent color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick accent color"
                value={accentColor || '#f59e0b'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 flex-none cursor-pointer rounded border border-border bg-surface p-0.5"
              />
              <Input
                id="accent_color"
                name="accent_color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#f59e0b"
                className="font-mono text-xs"
              />
              {accentColor && (
                <button
                  type="button"
                  onClick={() => setAccentColor('')}
                  className="flex-none text-xs text-foreground-subtle hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-foreground-subtle">
              Secondary highlights (e.g. the &ldquo;Up next&rdquo; tag). Leave blank to use defaults.
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
