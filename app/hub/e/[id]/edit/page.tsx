import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/dal';
import { countFutureInSeries, getEvent, getEventForEdit, listEventTypes } from '@/lib/events/queries';
import { listGroups } from '@/lib/groups/queries';
import { getChurchContext } from '@/lib/church/context';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { clockInZone, dayKeyInZone, zoneAbbreviation } from '@/lib/time/zoned';
import { EventForm } from '@/components/events/event-form';

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();

  const [viewer, editable] = await Promise.all([getEvent(id), getEventForEdit(id)]);
  if (!viewer || !editable) notFound();
  if (!viewer.can_edit) redirect(`/hub/e/${id}`);

  const { row, address, groupIds } = editable;
  const admin = await createServiceRoleClient();
  const [eventTypes, groups, campusRows, church, futureCount] = await Promise.all([
    listEventTypes(row.church_id),
    listGroups(row.church_id),
    admin.from('campuses').select('id, name').eq('church_id', row.church_id).eq('is_active', true).order('name'),
    getChurchContext(row.church_id),
    row.series_id ? countFutureInSeries(row.series_id, row.starts_at) : Promise.resolve(1),
  ]);
  if (!church) notFound();

  const isStaff = session.profile?.is_platform_admin || session.profile?.role !== 'participant';
  const targetable = groups.filter(
    (g) => isStaff || (g.is_member && !g.is_youth) || groupIds.includes(g.id),
  );

  return (
    <div>
      <Link href={`/hub/e/${id}`} className="text-sm text-foreground-muted hover:text-primary">
        ← Back to the gathering
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground">Edit {row.title}</h1>
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
            zoneLabel: zoneAbbreviation(row.starts_at, church.timezone),
            allowPublicHome: church.settings.allow_public_home_events,
          }}
          initial={{
            id: row.id,
            series_id: row.series_id,
            future_in_series: futureCount,
            status: row.status,
            event_type_id: row.event_type_id,
            title: row.title,
            description: row.description ?? '',
            date: dayKeyInZone(row.starts_at, church.timezone),
            start_time: clockInZone(row.starts_at, church.timezone),
            end_time: clockInZone(row.ends_at, church.timezone),
            campus_id: row.campus_id,
            visibility: row.visibility,
            audience_is_church_wide: row.audience_is_church_wide,
            group_ids: groupIds,
            invite_ring: row.invite_ring,
            venue_kind: row.venue_kind,
            location_name: row.location_name ?? '',
            address_line1: address?.address_line1 ?? '',
            address_line2: address?.address_line2 ?? '',
            city: row.city ?? '',
            region: row.region ?? '',
            postal_code: address?.postal_code ?? '',
            hide_address_until_rsvp: row.hide_address_until_rsvp,
            acknowledged_public_home: Boolean(row.public_home_acknowledged_at),
            capacity: row.capacity,
            rsvp_required: row.rsvp_required,
          }}
        />
      </div>
    </div>
  );
}
