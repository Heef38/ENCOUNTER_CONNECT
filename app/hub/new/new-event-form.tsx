'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { createEvent } from '@/lib/events/actions';
import type { EventType, EventVisibility, InviteRing } from '@/lib/events/types';

interface GroupOption {
  id: string;
  name: string;
  parent_name: string | null;
  member_count: number;
}

interface Props {
  eventTypes: EventType[];
  groups: GroupOption[];
  campuses: Array<{ id: string; name: string }>;
}

export function NewEventForm({ eventTypes, groups, campuses }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [typeId, setTypeId] = useState(eventTypes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('18:30');
  const [endTime, setEndTime] = useState('20:00');
  const [campusId, setCampusId] = useState('');

  // Visibility and the residence flag default from the event type: Home Group
  // is private + private-residence, the gathered-at-church types are public.
  const [visibility, setVisibility] = useState<EventVisibility>(
    eventTypes[0]?.default_visibility ?? 'private',
  );
  const [isResidence, setIsResidence] = useState(
    eventTypes[0]?.default_is_private_residence ?? false,
  );
  const [hideAddress, setHideAddress] = useState(
    eventTypes[0]?.default_is_private_residence ?? false,
  );

  function onTypeChange(next: string) {
    setTypeId(next);
    const t = eventTypes.find((x) => x.id === next);
    if (t) {
      setVisibility(t.default_visibility);
      setIsResidence(t.default_is_private_residence);
      setHideAddress(t.default_is_private_residence);
    }
  }

  const [churchWide, setChurchWide] = useState(false);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [inviteRing, setInviteRing] = useState<InviteRing>('members_only');

  const [locationName, setLocationName] = useState('');
  const [address1, setAddress1] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postal, setPostal] = useState('');
  const [capacity, setCapacity] = useState('');
  const [rsvpRequired, setRsvpRequired] = useState(false);

  // The one confirmation that matters: publishing a home address to the open
  // internet. Stated in plain language, naming the actual street, at the moment
  // the choice is made — not buried in a settings page.
  const publishingHomeAddress =
    visibility === 'public' && isResidence && address1.trim().length > 0;
  const [acknowledgedAddress, setAcknowledgedAddress] = useState(false);

  const ringGroups = groups.filter(
    (g) => groupIds.includes(g.id) && g.parent_name !== null,
  );

  function toggleGroup(id: string) {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }

  function submit() {
    setError(null);

    if (!date) {
      setError('Pick a date.');
      return;
    }
    if (publishingHomeAddress && !acknowledgedAddress) {
      setError('Confirm you want the address public, or make the event private.');
      return;
    }

    const starts = new Date(`${date}T${startTime}`);
    const ends = new Date(`${date}T${endTime}`);

    startTransition(async () => {
      const result = await createEvent({
        event_type_id: typeId,
        title,
        description,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        campus_id: campusId || null,
        visibility,
        audience_is_church_wide: visibility === 'private' ? churchWide : false,
        group_ids: visibility === 'private' && !churchWide ? groupIds : [],
        invite_ring: inviteRing,
        location_name: locationName,
        address_line1: address1,
        city,
        region,
        postal_code: postal,
        is_private_residence: isResidence,
        hide_address_until_rsvp: hideAddress,
        capacity: capacity ? Number(capacity) : null,
        rsvp_required: rsvpRequired,
        publish: true,
      });

      if (result.success) {
        router.push(`/hub/e/${result.data.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ── The basics ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="type">What kind of gathering?</Label>
            <select
              id="type"
              value={typeId}
              onChange={(e) => onTypeChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {eventTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="title">Name it</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tuesday night home group"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="description">What should people know? (optional)</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="start">Starts</Label>
              <Input
                id="start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end">Ends</Label>
              <Input
                id="end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {campuses.length > 1 && (
            <div>
              <Label htmlFor="campus">Campus (optional)</Label>
              <select
                id="campus"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
              >
                <option value="">No particular campus</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Who can see it ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-lg font-medium text-foreground">
              Who can see this?
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              There are two options on purpose — no in-between to get wrong.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors',
                visibility === 'public'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Globe className="h-4 w-4" />
                Public
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                Anyone can see it, including people who aren&apos;t signed in.
                All the details, address included.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors',
                visibility === 'private'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border-strong',
              )}
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock className="h-4 w-4" />
                Private
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                Only the groups you pick below. Everyone else at the church
                won&apos;t see it at all.
              </p>
            </button>
          </div>

          {visibility === 'private' && (
            <div className="space-y-3 rounded-md border border-border bg-surface-muted/30 p-4">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={churchWide}
                  onChange={(e) => setChurchWide(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Everyone at my church
                  <span className="block text-xs text-foreground-muted">
                    Any signed-in member can see it, but it stays off the public
                    page.
                  </span>
                </span>
              </label>

              {!churchWide && (
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
                    Which groups?
                  </legend>
                  {groups.length === 0 ? (
                    <p className="mt-2 text-sm text-foreground-muted">
                      You&apos;re not in any groups yet, so pick &ldquo;everyone
                      at my church&rdquo; or make it public.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {groups.map((g) => (
                        <label
                          key={g.id}
                          className="flex items-center gap-2 text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={groupIds.includes(g.id)}
                            onChange={() => toggleGroup(g.id)}
                          />
                          {g.name}
                          <span className="text-xs text-foreground-subtle">
                            {g.member_count} member{g.member_count === 1 ? '' : 's'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Who gets told ── */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div>
            <h2 className="font-display text-lg font-medium text-foreground">
              Who should hear about it?
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Separate question from who can see it — this is about who gets a
              notification.
            </p>
          </div>

          {(
            [
              [
                'members_only',
                'Just the groups I picked',
                'Nobody outside them gets a notification.',
              ],
              [
                'members_plus_eligible',
                'Also people who could be invited',
                ringGroups.length > 0
                  ? `Reaches everyone in ${ringGroups
                      .map((g) => g.parent_name)
                      .join(', ')} who isn't already in the group — and they'll be able to open it.`
                  : 'Widens to the parent group of each group you picked, so people who might otherwise be left out hear about it.',
              ],
              [
                'church_wide',
                'Everyone at my church',
                'Use sparingly — this notifies the whole congregation.',
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <input
                type="radio"
                name="ring"
                checked={inviteRing === value}
                onChange={() => setInviteRing(value)}
                className="mt-0.5"
              />
              <span>
                {label}
                <span className="block text-xs text-foreground-muted">{hint}</span>
              </span>
            </label>
          ))}

          <p className="rounded-md bg-info-bg px-3 py-2 text-xs text-info">
            Notifications aren&apos;t switched on yet — your event will show up on
            the hub, but nobody gets a text or email for it right now.
          </p>
        </CardContent>
      </Card>

      {/* ── Where ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Where?</h2>

          <div>
            <Label htmlFor="loc">Place name</Label>
            <Input
              id="loc"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="The Johnsons' house, Room 201, Zilker Park…"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="addr">Street address</Label>
            <Input
              id="addr"
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="region">State</Label>
              <Input id="region" value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="postal">ZIP</Label>
              <Input id="postal" value={postal} onChange={(e) => setPostal(e.target.value)} className="mt-1" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isResidence}
              onChange={(e) => setIsResidence(e.target.checked)}
            />
            This is someone&apos;s home
          </label>

          {visibility === 'private' && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={hideAddress}
                onChange={(e) => setHideAddress(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Only share the address once someone RSVPs
                <span className="block text-xs text-foreground-muted">
                  Until then people see the place name and city.
                </span>
              </span>
            </label>
          )}

          {publishingHomeAddress && (
            <div className="rounded-md bg-warning-bg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm text-warning">
                  <p className="font-semibold">
                    This will put {address1.trim()} on the open internet.
                  </p>
                  <p className="mt-1 text-xs">
                    A public event is visible to anyone, signed in or not, and can
                    be found by search engines. If this is a home, private is
                    usually the better choice.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={acknowledgedAddress}
                      onChange={(e) => setAcknowledgedAddress(e.target.checked)}
                    />
                    I understand — publish the address publicly
                  </label>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Details ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="capacity">How many can come? (optional)</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={rsvpRequired}
                  onChange={(e) => setRsvpRequired(e.target.checked)}
                />
                Ask people to RSVP
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex gap-3">
        <Button onClick={submit} disabled={pending || !title.trim()}>
          {pending ? 'Publishing…' : 'Publish event'}
        </Button>
        <Button variant="ghost" onClick={() => router.push('/')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
