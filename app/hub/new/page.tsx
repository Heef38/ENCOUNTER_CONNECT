import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/dal';
import { listEventTypes } from '@/lib/events/queries';
import { canHostEvents } from '@/lib/events/actions';
import { listGroups } from '@/lib/groups/queries';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { NewEventForm } from './new-event-form';

/**
 * Create an event.
 *
 * Hosting is open to anyone who has been through the connect platform, per the
 * trust-then-verify model — no approval queue. The gate is `canHostEvents()`
 * here and `ec_can_host_events()` in the events INSERT policy, so a crafted
 * request can't get around the page check.
 */
export default async function NewEventPage() {
  const session = await requireAuth();
  const churchId = session.profile?.church_id;

  if (!churchId) redirect('/');
  if (!(await canHostEvents())) redirect('/');

  const admin = await createServiceRoleClient();
  const [eventTypes, groups, campusRows] = await Promise.all([
    listEventTypes(churchId),
    listGroups(churchId),
    admin
      .from('campuses')
      .select('id, name')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .order('name'),
  ]);

  // Only offer groups the host can actually target: their own, plus (for staff)
  // anything in the church. listGroups already applies RLS, so a member never
  // sees a private group they don't belong to — meaning they can't target one
  // either.
  const isStaff =
    session.profile?.is_platform_admin || session.profile?.role !== 'participant';
  const targetable = isStaff ? groups : groups.filter((g) => g.is_member);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        Create an event
      </h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Home group, creation night, prayer set, or just getting people together.
      </p>

      <div className="mt-8">
        <NewEventForm
          eventTypes={eventTypes}
          groups={targetable.map((g) => ({
            id: g.id,
            name: g.name,
            parent_name: g.parent_name,
            member_count: g.member_count,
          }))}
          campuses={(campusRows.data ?? []) as Array<{ id: string; name: string }>}
        />
      </div>
    </div>
  );
}
