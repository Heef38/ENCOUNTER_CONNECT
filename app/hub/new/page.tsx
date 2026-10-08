import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/dal';
import { listEventTypes } from '@/lib/events/queries';
import { canHostEvents } from '@/lib/events/actions';
import { listGroups } from '@/lib/groups/queries';
import { getChurchContext } from '@/lib/church/context';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { zoneAbbreviation } from '@/lib/time/zoned';
import { EventForm } from '@/components/events/event-form';

/**
 * Create a gathering.
 *
 * Trust-then-verify: anyone with hosting standing publishes immediately. The
 * gate is canHostEvents() here and ec_can_host_events() in the events
 * INSERT policy, so a crafted request can't get around the page check.
 */
export default async function NewEventPage() {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;
  if (!churchId) redirect('/');
  if (!(await canHostEvents())) redirect('/hub/host');

  const admin = await createServiceRoleClient();
  const [eventTypes, groups, campusRows, church] = await Promise.all([
    listEventTypes(churchId),
    listGroups(churchId),
    admin.from('campuses').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name'),
    getChurchContext(churchId),
  ]);
  if (!church) redirect('/');

  // A member can aim a gathering at groups they belong to (the database
  // enforces it too); staff can aim at any group. Youth groups need a staff
  // host, so members never see them here.
  const isStaff = session.profile?.is_platform_admin || session.profile?.role !== 'participant';
  const targetable = groups.filter((g) => (isStaff ? true : g.is_member && !g.is_youth));

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Host a gathering</h1>
      <p className="mt-1 text-sm text-foreground-muted">A home group, a prayer night, a class, or just getting people together.</p>
      <div className="mt-8">
        <EventForm
          eventTypes={eventTypes}
          groups={targetable.map((g) => ({
            id: g.id,
            name: g.name,
            parent_name: g.parent_name,
            member_count: g.member_count,
            is_youth: g.is_youth,
          }))}
          campuses={(campusRows.data ?? []) as Array<{ id: string; name: string }>}
          church={{
            timezone: church.timezone,
            zoneLabel: zoneAbbreviation(new Date().toISOString(), church.timezone),
            allowPublicHome: church.settings.allow_public_home_events,
          }}
        />
      </div>
    </div>
  );
}
