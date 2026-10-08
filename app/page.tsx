import Link from 'next/link';
import { getSession } from '@/lib/auth/dal';
import { buildNavGroups } from '@/lib/auth/nav';
import { ECNav } from '@/components/layout/ec-nav';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HubView } from '@/components/events/hub-view';
import { listEventTypes, listHubEvents, listPublicEvents } from '@/lib/events/queries';
import { canHostEvents } from '@/lib/events/actions';
import { listMyGroups } from '@/lib/groups/queries';
import { resolvePublicChurch, listPublicChurches } from '@/lib/church/public-church';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { HubView as HubViewMode } from '@/components/events/hub-filters';

/**
 * The connection hub — the site's main page.
 *
 * Two paths through this file:
 *
 *   Authenticated → the full hub. Every event the user is entitled to see,
 *     enforced by the `events` RLS policy (`ec_can_see_event`), so there is no
 *     visibility filtering in this file at all.
 *
 *   Anonymous → a real, usable browser of PUBLIC events (not a teaser): the
 *     same calendar and list, real detail pages. Public means public. What
 *     anonymous visitors don't get: RSVP, reporting, hosting, and any private
 *     event. Tenant context comes from resolvePublicChurch() because URLs
 *     carry no church slug.
 */

interface HubSearchParams {
  view?: string;
  type?: string;
  group?: string;
  campus?: string;
  month?: string;
  church?: string;
  auth_error?: string;
  next?: string;
}

/** `month=YYYY-MM` → the window the calendar and list cover. */
function resolveMonth(monthParam?: string): {
  year: number;
  month: number;
  from: string;
  to: string;
} {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }

  // The calendar needs the whole month. The list is more useful showing what's
  // ahead, so when the month is the current one we start from today.
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return {
    year,
    month,
    from: (isCurrentMonth ? new Date(now.getFullYear(), now.getMonth(), 1) : monthStart).toISOString(),
    to: monthEnd.toISOString(),
  };
}

async function listCampuses(churchId: string): Promise<Array<{ id: string; name: string }>> {
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('campuses')
    .select('id, name')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export default async function HubPage({
  searchParams,
}: {
  searchParams: Promise<HubSearchParams>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const view: HubViewMode = params.view === 'list' ? 'list' : 'calendar';
  const { year, month, from, to } = resolveMonth(params.month);

  const active = {
    type: params.type,
    group: params.group,
    campus: params.campus,
    month: params.month,
  };

  // ── Authenticated hub ──────────────────────────────────────
  if (session) {
    const churchId = session.profile?.church_id ?? null;

    // `/` lives outside the (ec) route group, so the nav is rendered here
    // rather than inherited from a layout. Same builder, so a user who is both
    // admin and connector sees the same groups they see everywhere else.
    const navGroups = await buildNavGroups(session);
    const userLabel =
      [session.profile?.first_name, session.profile?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || session.email;

    const [events, eventTypes, myGroups, campuses, canHost] = await Promise.all([
      listHubEvents({
        from,
        to,
        event_type_id: params.type,
        campus_id: params.campus,
        group_id: params.group,
      }),
      churchId ? listEventTypes(churchId) : Promise.resolve([]),
      listMyGroups(),
      churchId ? listCampuses(churchId) : Promise.resolve([]),
      canHostEvents(),
    ]);

    return (
      <div className="min-h-screen bg-background">
        <ECNav groups={navGroups} userLabel={userLabel} homeHref="/" />
        <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              What&apos;s coming up
            </h1>
            <p className="mt-1 text-sm text-foreground-muted">
              Home groups, creation nights, prayer sets, and everything else
              happening around you.
            </p>
          </div>
          {canHost && (
            <Link href="/hub/new">
              <Button>Create an event</Button>
            </Link>
          )}
        </header>

        <HubView
          events={events}
          eventTypes={eventTypes}
          myGroups={myGroups}
          campuses={campuses}
          view={view}
          month={{ year, month }}
          active={active}
          emptyMessage="Nothing on the calendar this month yet. If you're gathering people, you can be the one to put something up."
        />
        </main>
      </div>
    );
  }

  // ── Anonymous ──────────────────────────────────────────────
  const { church, hasMultiple, source } = await resolvePublicChurch(params.church);

  const [events, eventTypes, campuses] = church
    ? await Promise.all([
        listPublicEvents(church.id, {
          from,
          to,
          event_type_id: params.type,
          campus_id: params.campus,
        }),
        listEventTypes(church.id),
        listCampuses(church.id),
      ])
    : [[], [], []];

  const otherChurches = !church && hasMultiple ? await listPublicChurches() : [];

  return (
    <main className="relative flex min-h-screen flex-col bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,184,166,0.18),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        {/* Hero + sign-in, side by side */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <section className="flex flex-col items-center text-center lg:items-start lg:text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/EC.png"
              alt="Encounter Connect"
              className="h-auto w-64 object-contain md:w-80"
            />

            <h1 className="mt-6 max-w-xl font-display text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-5xl">
              {church ? `What's happening at ${church.name}` : 'Find your people.'}
            </h1>

            <p className="mt-4 max-w-lg text-base text-foreground-muted">
              Home groups, creation nights, prayer sets, and get-togethers — open
              to anyone. Sign in to see everything your groups are doing, RSVP,
              or host something of your own.
            </p>
          </section>

          <section className="w-full">
            <div className="mx-auto w-full max-w-sm lg:ml-auto lg:mr-0">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-5">
                    <h2 className="font-display text-xl font-semibold text-foreground">
                      Welcome back
                    </h2>
                    <p className="mt-1 text-sm text-foreground-muted">
                      Sign in to RSVP and see your groups&apos; events.
                    </p>
                  </div>
                  {params.auth_error && (
                    <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                      That sign-in link didn&apos;t work — it may have expired.
                      Request a fresh one below.
                    </p>
                  )}
                  <LoginForm />
                </CardContent>
              </Card>
              <p className="mt-6 text-center text-sm text-foreground-muted">
                New here?{' '}
                <a href="/signup" className="font-medium text-primary hover:underline">
                  Create an account
                </a>
              </p>
            </div>
          </section>
        </div>

        {/* Public events browser */}
        <div className="mt-16">
          {church ? (
            <>
              <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                    Public events
                  </h2>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Open to everyone — no account needed. Sign in to see events
                    for the groups you&apos;re part of.
                  </p>
                </div>
                {/* Only offer the switcher when the church was a guess and
                    there's genuinely more than one. */}
                {hasMultiple && source !== 'query' && (
                  <Link
                    href="/signup"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Not {church.name}?
                  </Link>
                )}
              </header>

              <HubView
                events={events}
                eventTypes={eventTypes}
                myGroups={[]}
                campuses={campuses}
                view={view}
                month={{ year, month }}
                active={active}
                emptyMessage="No public events on the calendar this month. There may be more happening inside the groups — sign in to see them."
              />
            </>
          ) : otherChurches.length > 0 ? (
            <section>
              <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                Pick your church
              </h2>
              <p className="mt-1 text-sm text-foreground-muted">
                We couldn&apos;t tell which church you&apos;re looking for.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {otherChurches.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/?church=${c.slug}`}
                      className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
