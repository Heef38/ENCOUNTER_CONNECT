'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { startHomeGroup } from '@/lib/groups/actions';

export function StartHomeGroupForm({
  people,
  campuses,
  zoneLabel,
}: {
  people: Array<{ id: string; name: string }>;
  campuses: Array<{ id: string; name: string }>;
  zoneLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const select = 'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground';

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          setError(null);
          const r = await startHomeGroup(fd);
          if (r.success) router.push(`/groups/${r.data.groupId}`);
          else setError(r.error);
        })
      }
      className="space-y-6"
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="The Garcias' Tuesday group" required className="mt-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="leader">Leader (hosts it)</Label>
              <select id="leader" name="leader_profile_id" required className={select} defaultValue="">
                <option value="" disabled>
                  Pick the leader
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {campuses.length > 1 && (
              <div>
                <Label htmlFor="campus">Nearest campus</Label>
                <select id="campus" name="campus_id" className={select} defaultValue="">
                  <option value="">Any</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="description">What is it? (optional)</Label>
            <textarea id="description" name="description" rows={2} className={select} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-display text-lg font-medium text-foreground">When and where</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label htmlFor="date">First meeting</Label>
              <Input id="date" name="date" type="date" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="start">Starts</Label>
              <Input id="start" name="start_time" type="time" defaultValue="18:30" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="end">Ends</Label>
              <Input id="end" name="end_time" type="time" defaultValue="20:30" className="mt-1" />
            </div>
          </div>
          <p className="-mt-2 text-xs text-foreground-subtle">Times are {zoneLabel}.</p>
          <div>
            <Label htmlFor="weeks">Weeks to put on the calendar</Label>
            <select id="weeks" name="weeks" defaultValue="8" className={select}>
              {[4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} weeks
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="addr">The leader&apos;s home address</Label>
            <Input id="addr" name="address_line1" required className="mt-1" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="region">State</Label>
              <Input id="region" name="region" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="postal">ZIP</Label>
              <Input id="postal" name="postal_code" className="mt-1" />
            </div>
          </div>
          <p className="rounded-md bg-surface-muted/40 px-3 py-2 text-xs text-foreground-muted">
            Each week is private to the group, pinned at the church on the map, and shares the address only with members
            who say they&apos;re going. The leader can edit or cancel any week.
          </p>
        </CardContent>
      </Card>
      {error && <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Starting…' : 'Start the home group'}
      </Button>
    </form>
  );
}
