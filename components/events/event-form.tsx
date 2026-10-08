'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Globe, Home, Lock, MapPin, Monitor, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { createEvent, updateEvent } from '@/lib/events/actions';
import type { EventInput, EventType, EventVisibility, InviteRing, VenueKind } from '@/lib/events/types';

export interface GroupOption {
  id: string;
  name: string;
  parent_name: string | null;
  member_count: number;
  is_youth: boolean;
}

export interface EventFormInitial extends EventInput {
  id: string;
  series_id: string | null;
  future_in_series: number;
  status: string;
}

interface Props {
  eventTypes: EventType[];
  groups: GroupOption[];
  campuses: Array<{ id: string; name: string }>;
  church: { timezone: string; zoneLabel: string; allowPublicHome: boolean };
  /** Present when editing. */
  initial?: EventFormInitial;
}

const VENUES: Array<{ value: VenueKind; label: string; hint: string; Icon: typeof MapPin }> = [
  { value: 'campus', label: 'At our church', hint: 'One of our campuses.', Icon: School },
  { value: 'public_place', label: 'A public place', hint: 'A park, a coffee shop, a restaurant.', Icon: MapPin },
  { value: 'home', label: "Someone's home", hint: 'Never shown on a map. The address goes only to the people you choose.', Icon: Home },
  { value: 'online', label: 'Online', hint: 'No address.', Icon: Monitor },
];

function todayIn(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function EventForm({ eventTypes, groups, campuses, church, initial }: Props) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const firstType = eventTypes[0];
  const [typeId, setTypeId] = useState(initial?.event_type_id ?? firstType?.id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [startTime, setStartTime] = useState(initial?.start_time ?? '18:30');
  const [endTime, setEndTime] = useState(initial?.end_time ?? '20:00');
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const [venue, setVenue] = useState<VenueKind>(initial?.venue_kind ?? firstType?.default_venue_kind ?? 'campus');
  const [campusId, setCampusId] = useState(initial?.campus_id ?? (campuses.length === 1 ? campuses[0].id : ''));
  const [locationName, setLocationName] = useState(initial?.location_name ?? '');
  const [address1, setAddress1] = useState(initial?.address_line1 ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [postal, setPostal] = useState(initial?.postal_code ?? '');

  const [visibility, setVisibility] = useState<EventVisibility>(
    initial?.visibility ?? firstType?.default_visibility ?? 'private',
  );
  const [holdAddress, setHoldAddress] = useState(initial?.hide_address_until_rsvp ?? false);
  const [acknowledged, setAcknowledged] = useState(Boolean(initial?.acknowledged_public_home));

  const [churchWide, setChurchWide] = useState(initial?.audience_is_church_wide ?? false);
  const [groupIds, setGroupIds] = useState<string[]>(initial?.group_ids ?? []);
  const [inviteRing, setInviteRing] = useState<InviteRing>(initial?.invite_ring ?? 'members_only');

  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : '');
  const [rsvpRequired, setRsvpRequired] = useState(initial?.rsvp_required ?? false);
  const [scope, setScope] = useState<'one' | 'future'>('one');

  function onTypeChange(next: string) {
    setTypeId(next);
    if (editing) return;
    const t = eventTypes.find((x) => x.id === next);
    if (t) {
      setVenue(t.default_venue_kind);
      setVisibility(t.default_venue_kind === 'home' && !church.allowPublicHome ? 'private' : t.default_visibility);
    }
  }

  function onVenueChange(next: VenueKind) {
    setVenue(next);
    if (next === 'home' && visibility === 'public' && !church.allowPublicHome) setVisibility('private');
  }

  const isHome = venue === 'home';
  const homeCanBePublic = church.allowPublicHome;
  const publishingHome = visibility === 'public' && isHome;
  const youthPicked = groups.some((g) => g.is_youth && groupIds.includes(g.id));
  const ringGroups = groups.filter((g) => groupIds.includes(g.id) && g.parent_name !== null);

  function toggleGroup(id: string) {
    setGroupIds((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  function submit(publish: boolean) {
    setError(null);
    if (!date) return setError('Pick a date.');
    if (publishingHome && !acknowledged) {
      return setError('Confirm you want the address public, or make the gathering private.');
    }

    const input: EventInput = {
      event_type_id: typeId,
      title,
      description,
      date,
      start_time: startTime,
      end_time: endTime,
      campus_id: campusId || null,
      visibility,
      audience_is_church_wide: visibility === 'private' ? churchWide : false,
      group_ids: visibility === 'private' && !churchWide ? groupIds : [],
      invite_ring: inviteRing,
      venue_kind: venue,
      location_name: locationName,
      address_line1: isHome || venue === 'public_place' ? address1 : '',
      city: isHome || venue === 'public_place' ? city : '',
      region: isHome || venue === 'public_place' ? region : '',
      postal_code: isHome || venue === 'public_place' ? postal : '',
      hide_address_until_rsvp: visibility === 'private' && (isHome || holdAddress),
      acknowledged_public_home: publishingHome && acknowledged,
      capacity: capacity ? Number(capacity) : null,
      rsvp_required: rsvpRequired,
      repeat_weeks: editing ? 1 : repeatWeeks,
      publish,
    };

    startTransition(async () => {
      const result = initial ? await updateEvent(initial.id, input, scope) : await createEvent(input);
      if (result.success) {
        router.push(`/hub/e/${result.data.id}`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const selectClass =
    'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

  return (
    <div className="space-y-6">
      {/* ── The basics ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="type">What kind of gathering?</Label>
            <select id="type" value={typeId} onChange={(e) => onTypeChange(e.target.value)} className={selectClass}>
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
              maxLength={140}
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
              maxLength={5000}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            />
            <p className="mt-1 text-xs text-foreground-subtle">
              Everyone who can see this gathering can read this. Leave phone numbers and addresses out of it.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" min={editing ? undefined : todayIn(church.timezone)} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="start">Starts</Label>
              <Input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="end">Ends</Label>
              <Input id="end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-foreground-subtle">Times are {church.zoneLabel}, your church&apos;s time zone.</p>

          {!editing && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              <label htmlFor="repeat">Repeat</label>
              <select
                id="repeat"
                value={repeatWeeks}
                onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value={1}>does not repeat</option>
                {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <option key={n} value={n}>
                    every week, {n} times
                  </option>
                ))}
              </select>
              {repeatWeeks > 1 && (
                <span className="text-xs text-foreground-muted">
                  Good for a home group or a {repeatWeeks}-week class. Each week can be edited or cancelled on its own.
                </span>
              )}
            </div>
          )}

          {editing && initial?.series_id && initial.future_in_series > 1 && (
            <fieldset className="rounded-md border border-border p-3 text-sm">
              <legend className="px-1 text-xs font-semibold uppercase tracking-widest text-foreground-subtle">
                This gathering repeats
              </legend>
              <label className="mr-4 inline-flex items-center gap-2">
                <input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} />
                Change this one only
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="scope" checked={scope === 'future'} onChange={() => setScope('future')} />
                This and the {initial.future_in_series - 1} after it
              </label>
            </fieldset>
          )}
        </CardContent>
      </Card>

      {/* ── Where ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">Where?</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {VENUES.map(({ value, label, hint, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onVenueChange(value)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  venue === value ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong',
                )}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="h-4 w-4" />
                  {label}
                </div>
                <p className="mt-0.5 text-xs text-foreground-muted">{hint}</p>
              </button>
            ))}
          </div>

          {venue === 'campus' && campuses.length > 1 && (
            <div>
              <Label htmlFor="campus">Which campus?</Label>
              <select id="campus" value={campusId} onChange={(e) => setCampusId(e.target.value)} className={selectClass}>
                <option value="">Pick a campus</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {venue !== 'campus' && (
            <div>
              <Label htmlFor="loc">{venue === 'online' ? 'How people join (optional)' : 'Place name (optional)'}</Label>
              <Input
                id="loc"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder={
                  venue === 'home' ? "The Johnsons'" : venue === 'online' ? 'Zoom link sent after RSVP' : 'Cuppa Coffee, Room 201, the park pavilion'
                }
                className="mt-1"
              />
            </div>
          )}

          {(venue === 'public_place' || isHome) && (
            <>
              <div>
                <Label htmlFor="addr">Street address</Label>
                <Input id="addr" value={address1} onChange={(e) => setAddress1(e.target.value)} className="mt-1" autoComplete="street-address" />
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
              {campuses.length > 1 && (
                <div>
                  <Label htmlFor="campus2">Nearest campus (for the map pin)</Label>
                  <select id="campus2" value={campusId} onChange={(e) => setCampusId(e.target.value)} className={selectClass}>
                    <option value="">No particular campus</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {isHome && (
                <p className="rounded-md bg-surface-muted/40 px-3 py-2 text-xs text-foreground-muted">
                  A home is never put on a map. People browsing see the city and a pin at the church, and the street
                  address goes only to people who say they&apos;re going.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Who can see it ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-lg font-medium text-foreground">Who can see this?</h2>
            <p className="mt-1 text-sm text-foreground-muted">There are two options on purpose, so there is nothing in between to get wrong.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={isHome && !homeCanBePublic}
              onClick={() => setVisibility('public')}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                visibility === 'public' ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong',
              )}
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Globe className="h-4 w-4" />
                Public
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                {isHome && !homeCanBePublic
                  ? 'Your church keeps home gatherings private.'
                  : "Anyone can see it, signed in or not, and it can show up in search. Your first name and last initial appear as host."}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setVisibility('private')}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors',
                visibility === 'private' ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong',
              )}
            >
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock className="h-4 w-4" />
                Private
              </div>
              <p className="mt-1 text-xs text-foreground-muted">
                Only the people you pick below. Everyone else won&apos;t see it at all.
              </p>
            </button>
          </div>

          {visibility === 'private' && (
            <div className="space-y-3 rounded-md border border-border bg-surface-muted/30 p-4">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" checked={churchWide} onChange={(e) => setChurchWide(e.target.checked)} className="mt-0.5" disabled={youthPicked} />
                <span>
                  Everyone at my church
                  <span className="block text-xs text-foreground-muted">
                    Anyone with an account at our church can see it{isHome ? ', and anyone going gets the address' : ''}. It stays off the public page.
                  </span>
                </span>
              </label>

              {!churchWide && (
                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-widest text-foreground-subtle">Which groups?</legend>
                  {groups.length === 0 ? (
                    <p className="mt-2 text-sm text-foreground-muted">
                      You&apos;re not in any groups yet, so pick &ldquo;everyone at my church&rdquo; or make it public.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm text-foreground">
                          <input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                          {g.name}
                          <span className="text-xs text-foreground-subtle">
                            {g.member_count} member{g.member_count === 1 ? '' : 's'}
                            {g.is_youth ? ' · youth' : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}

              {venue === 'public_place' && (
                <label className="flex items-start gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={holdAddress} onChange={(e) => setHoldAddress(e.target.checked)} className="mt-0.5" />
                  <span>
                    Only share the address with people going
                    <span className="block text-xs text-foreground-muted">Until then people see the place name and city.</span>
                  </span>
                </label>
              )}

              {youthPicked && (
                <p className="rounded-md bg-info-bg px-3 py-2 text-xs text-info">
                  A youth gathering stays private, keeps its address for people going, and needs a staff host.
                </p>
              )}
            </div>
          )}

          {publishingHome && (
            <div className="rounded-md bg-warning-bg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm text-warning">
                  <p className="font-semibold">
                    This will put {address1.trim() || 'this home address'} on the open internet.
                  </p>
                  <p className="mt-1 text-xs">
                    A public gathering is visible to anyone, signed in or not, and can be found by search engines.
                    It still won&apos;t be pinned on a map. If this is a home, private is usually the better choice.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                    I understand. Publish the address publicly.
                  </label>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Who gets told ── */}
      {visibility === 'private' && !churchWide && groupIds.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <h2 className="font-display text-lg font-medium text-foreground">Who else should be able to come?</h2>
            </div>
            {(
              [
                ['members_only', 'Just the groups I picked', 'Nobody outside them sees it.'],
                [
                  'members_plus_eligible',
                  'Also people who could be invited',
                  ringGroups.length > 0
                    ? `Opens it to everyone in ${ringGroups.map((g) => g.parent_name).join(', ')}, so people who might be left out can come.`
                    : 'Opens it to the wider group each group belongs to, when it has one.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm text-foreground">
                <input type="radio" name="ring" checked={inviteRing === value} onChange={() => setInviteRing(value)} className="mt-0.5" />
                <span>
                  {label}
                  <span className="block text-xs text-foreground-muted">{hint}</span>
                </span>
              </label>
            ))}
            <p className="rounded-md bg-info-bg px-3 py-2 text-xs text-info">
              Publishing doesn&apos;t send texts or emails yet. People find it on the hub, and anyone who RSVPs hears if it&apos;s cancelled.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Details ── */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="capacity">How many can come? (optional)</Label>
              <Input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={rsvpRequired} onChange={(e) => setRsvpRequired(e.target.checked)} />
                Ask people to RSVP
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {(!initial || initial.status === 'draft') && (
          <Button onClick={() => submit(true)} disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : repeatWeeks > 1 && !editing ? `Publish ${repeatWeeks} gatherings` : 'Publish'}
          </Button>
        )}
        {initial && initial.status !== 'draft' && (
          <Button onClick={() => submit(true)} disabled={pending || !title.trim()}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        )}
        {(!initial || initial.status === 'draft') && (
          <Button variant="outline" onClick={() => submit(false)} disabled={pending || !title.trim()}>
            Save as draft
          </Button>
        )}
        <Button variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
