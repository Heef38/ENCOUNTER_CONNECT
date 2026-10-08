import Link from 'next/link';
import { getSession, type SessionUser } from '@/lib/auth/dal';
import { buildNavGroups } from '@/lib/auth/nav';
import { ECNav } from '@/components/layout/ec-nav';
import { LoginForm } from '@/components/auth/login-form';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HubView } from '@/components/events/hub-view';
import { GatheringMap } from '@/components/map/gathering-map';
import type { HubView as HubViewMode } from '@/components/events/hub-filters';
import { listEventTypes, listHubEvents, listMyDrafts, listPublicEvents } from '@/lib/events/queries';
import { canHostEvents } from '@/lib/events/actions';
import { campusPins, churchPins, gatheringPins, mapCenter, type CampusPin, type ChurchPin } from '@/lib/events/map-pins';
import { listMyGroups } from '@/lib/groups/queries';
import { resolvePublicChurch, listPublicChurches } from '@/lib/church/public-church';
import { getChurchContext, type ChurchContext } from '@/lib/church/context';
import { connectName, PLATFORM_NAME } from '@/lib/brand';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { monthWindowInZone, yearMonthInZone, formatDateInZone } from '@/lib/time/zoned';

/**
 * The connection hub — the site's main page, for everyone.
 *
 *   Signed in → every gathering at the person's church that they may see,
 *     enforced by RLS (ec_can_see_event), on a map, a calendar, or a list.
 *
 *   Signed out → the front door: the hint church's public gatherings (from
 *     ?church=, the cookie set by /c/<slug>, or the only listed church), or
 *     a map of every listed church when there is no hint. Public means
 *     public; private gatherings never reach this path.
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

/** The month on screen and the window to load, in the church's timezone. */
function resolveMonth(monthParam: string | undefined, timeZone: string) {
  const now = yearMonthInZone(new Date(), timeZone);
  let { year, month } = now;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    if (m >= 1 && m <= 12 && y > 2000 && y < 2200) {
      year = y;
      month = m;
    }
  }
  const window = monthWindowInZone(year, month, timeZone);
  const isCurrent = year === now.year && month === now.month;
  return {
    year,
    month,
    to: window.to,
    // The calendar shows the whole month; the list and map start today.
    calendarFrom: window.from,
    listFrom: isCurrent ? new Date().toISOString() : window.from,
    label: formatDateInZone(window.from, timeZone, { month: 'long', year: 'numeric' }),
  };
}

function parseView(raw: string | undefined, fallback: HubViewMode): HubViewMode {
  return raw === 'list' || raw === 'calendar' || raw === 'map' ? raw : fallback;
}

async function loadPlaces(churchId: string): Promise<{ campuses: CampusPin[]; others: ChurchPin[] }> {
  const admin = await createServiceRoleClient();
  const [{ data: campuses }, { data: listed }] = await Promise.all([
    admin
      .from('campuses')
      .select('id, name, lat, lng, city')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('name'),
    admin.rpc('ec_listed_church_pins'),
  ]);
  return {
    campuses: (campuses ?? []) as CampusPin[],
    others: (listed ?? []) as ChurchPin[],
  };
}

function churchLabel(church: ChurchContext): string {
  return connectName(church);
}

export default async function HubPage({ searchParams }: { searchParams: Promise<HubSearchParams> }) {
  const params = await searchParams;
  const session = await getSession();
  if (session) return <SignedInHub session={session} params={params} />;
  return <FrontDoor params={params} />;
}

// ── Signed in ──────────────────────────────────────────────────

async function SignedInHub({ session, params }: { session: SessionUser; params: HubSearchParams }) {
  const navGroups = await buildNavGroups(session);
  const userLabel =
    [session.profile?.first_name, session.profile?.last_name].filter(Boolean).join(' ').trim() || session.email;

  // A platform admin without a home church acts in the church they point at.
  let churchId = session.profile?.church_id ?? null;
  if (!churchId && session.profile?.is_platform_admin) {
    churchId = (await resolvePublicChurch(params.church)).church?.id ?? null;
  }
  const church = churchId ? await getChurchContext(churchId) : null;

  if (!church) {
    return (
      <div className="min-h-screen bg-background">
        <ECNav groups={navGroups} userLabel={userLabel} homeHref="/" />
        <main className="mx-auto w-full max-w-3xl px-6 py-12">
          <h1 className="font-display text-2xl font-semibold text-foreground">You&apos;re not attached to a church yet</h1>
          <p className="mt-2 text-sm text-foreground-muted">
            Ask your church to invite you, or find your church at <Link className="text-primary hover:underline" href="/signup">the church list</Link>.
          </p>
        </main>
      </div>
    );
  }

  const { campuses, others } = await loadPlaces(church.id);
  const hasPin = campuses.some((c) => c.lat !== null);
  const view = parseView(params.view, hasPin ? 'map' : 'calendar');
  const m = resolveMonth(params.month, church.timezone);

  const [events, eventTypes, myGroups, canHost, drafts] = await Promise.all([
    listHubEvents(church.id, {
      from: view === 'calendar' ? m.calendarFrom : m.listFrom,
      to: m.to,
      event_type_id: params.type,
      campus_id: params.campus,
      group_id: params.group,
    }),
    listEventTypes(church.id),
    listMyGroups(),
    canHostEvents(),
    listMyDrafts(),
  ]);

  const pins = [
    ...gatheringPins(events),
    ...campusPins(campuses, `/c/${church.slug ?? ''}`),
    ...churchPins(others, church.id),
  ];

  return (
    <div className="min-h-screen bg-background">
      <ECNav groups={navGroups} userLabel={userLabel} homeHref="/" />
      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-subtle">{churchLabel(church)}</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">What&apos;s happening</h1>
            <p className="mt-1 text-sm text-foreground-muted">{m.label}. Home groups, prayer nights, classes, and everything your church is up to.</p>
          </div>
          {canHost ? (
            <Link href="/hub/new">
              <Button>Host a gathering</Button>
            </Link>
          ) : (
            <Link href="/hub/host" className="text-sm font-medium text-primary hover:underline">
              Want to host something?
            </Link>
          )}
        </header>

        {drafts.length > 0 && (
          <section className="mb-6 rounded-lg border border-dashed border-border p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle">Your drafts</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`/hub/e/${d.id}`} className="font-medium text-foreground hover:text-primary">
                    {d.title}
                  </Link>{' '}
                  <span className="text-foreground-subtle">· {formatDateInZone(d.starts_at, d.timezone, { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <HubView
          events={events}
          eventTypes={eventTypes}
          myGroups={myGroups}
          campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
          view={view}
          month={{ year: m.year, month: m.month }}
          active={{ type: params.type, group: params.group, campus: params.campus, month: params.month }}
          timeZone={church.timezone}
          pins={pins}
          mapCenter={mapCenter(campuses, pins)}
          emptyMessage="Nothing on the calendar this month yet. If you're gathering people, you can be the one to put something up."
        />
      </main>
    </div>
  );
}

// ── Signed out ─────────────────────────────────────────────────

async function FrontDoor({ params }: { params: HubSearchParams }) {
  const { church: hint, hasMultiple, source } = await resolvePublicChurch(params.church);
  const church = hint ? await getChurchContext(hint.id) : null;

  const signIn = (
    <Card>
      <CardContent className="p-6">
        <div className="mb-5">
          <h2 className="font-display text-xl font-semibold text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-foreground-muted">Sign in to RSVP and see your groups&apos; gatherings.</p>
        </div>
        {params.auth_error && (
          <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
            That sign-in link didn&apos;t work. It may have expired, so request a fresh one below.
          </p>
        )}
        <LoginForm />
        <p className="mt-6 text-center text-sm text-foreground-muted">
          New here?{' '}
          <a href={church?.slug ? `/c/${church.slug}` : '/signup'} className="font-medium text-primary hover:underline">
            Create an account
          </a>
        </p>
      </CardContent>
    </Card>
  );

  if (!church) {
    // No hint: the wider body, as listed church pins only.
    const admin = await createServiceRoleClient();
    const { data: listed } = await admin.rpc('ec_listed_church_pins');
    const pins = churchPins((listed ?? []) as ChurchPin[], null);
    const choices = hasMultiple ? await listPublicChurches() : [];
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
            <section>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-foreground">Find your people.</h1>
              <p className="mt-2 max-w-xl text-base text-foreground-muted">
                Churches near you, and what they&apos;re doing this month. Open to everyone.
              </p>
              <div className="mt-6">
                <GatheringMap pins={pins} zoom={6} label="Churches near you" />
              </div>
              {choices.length > 0 && (
                <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                  {choices.map((c) => (
                    <li key={c.id}>
                      <Link href={`/?church=${c.slug}`} className="block rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <aside className="w-full">{signIn}</aside>
          </div>
          <p className="mt-10 text-center text-xs text-foreground-subtle">{PLATFORM_NAME}</p>
        </div>
      </main>
    );
  }

  const { campuses, others } = await loadPlaces(church.id);
  const view = parseView(params.view, campuses.some((c) => c.lat !== null) ? 'map' : 'calendar');
  const m = resolveMonth(params.month, church.timezone);

  const [events, eventTypes] = await Promise.all([
    listPublicEvents(church.id, {
      from: view === 'calendar' ? m.calendarFrom : m.listFrom,
      to: m.to,
      event_type_id: params.type,
      campus_id: params.campus,
    }),
    listEventTypes(church.id),
  ]);

  const pins = [
    ...gatheringPins(events),
    ...campusPins(campuses, `/c/${church.slug ?? ''}`),
    ...churchPins(others, church.id),
  ];

  return (
    <main className="relative min-h-screen bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[50vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,184,166,0.16),transparent_70%)]" />
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <section className="min-w-0">
            <div className="flex items-center gap-3">
              {church.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={church.logo_url} alt="" className="h-10 w-auto object-contain" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{connectName(church)}</p>
                <p className="text-xs text-foreground-subtle">through {PLATFORM_NAME}</p>
              </div>
            </div>
            <h1 className="mt-6 font-display text-4xl font-semibold leading-tight tracking-tight text-foreground">
              What&apos;s happening at {church.name}
            </h1>
            <p className="mt-2 max-w-xl text-base text-foreground-muted">
              Open to anyone, no account needed. {m.label}.
              {hasMultiple && source !== 'query' && (
                <>
                  {' '}
                  <Link href="/signup" className="font-medium text-primary hover:underline">
                    Not {church.name}?
                  </Link>
                </>
              )}
            </p>
            <div className="mt-6">
              <HubView
                events={events}
                eventTypes={eventTypes}
                myGroups={[]}
                campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
                view={view}
                month={{ year: m.year, month: m.month }}
                active={{ type: params.type, campus: params.campus, month: params.month, church: params.church }}
                timeZone={church.timezone}
                pins={pins}
                mapCenter={mapCenter(campuses, pins)}
                emptyMessage="No open gatherings this month. There's more happening inside the church's groups; sign in to see them."
              />
            </div>
          </section>
          <aside className="w-full lg:pt-24">{signIn}</aside>
        </div>
      </div>
    </main>
  );
}
