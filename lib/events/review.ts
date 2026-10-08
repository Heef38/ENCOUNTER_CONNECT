import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

export interface ReviewItem {
  event: {
    id: string;
    title: string;
    status: string;
    starts_at: string;
    timezone: string;
    visibility: string;
    venue_kind: string;
    hidden_reason: string | null;
    host_name: string;
    host_profile_id: string | null;
    host_blocked: boolean;
  };
  reports: Array<{
    id: string;
    reason: string;
    note: string | null;
    created_at: string;
    reporter_name: string;
    reporter_from_this_church: boolean;
  }>;
}

/**
 * Open reports and hidden gatherings for one church. Called only from
 * /hub/review after requireCampusAdmin, with the admin's own church id;
 * service role because report rows and reporter names are staff-only
 * reads assembled across tables.
 */
export async function listReviewQueue(churchId: string): Promise<ReviewItem[]> {
  const admin = await createServiceRoleClient();

  const [{ data: openReports }, { data: hiddenEvents }] = await Promise.all([
    admin
      .from('event_reports')
      .select('id, event_id, reason, note, created_at, reporter_profile_id, event:events!inner ( church_id )')
      .is('resolved_at', null)
      .eq('event.church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('events').select('id').eq('church_id', churchId).eq('status', 'hidden').limit(200),
  ]);

  const reports = (openReports ?? []) as unknown as Array<{
    id: string;
    event_id: string;
    reason: string;
    note: string | null;
    created_at: string;
    reporter_profile_id: string | null;
  }>;
  const eventIds = Array.from(new Set([...reports.map((r) => r.event_id), ...((hiddenEvents ?? []) as Array<{ id: string }>).map((e) => e.id)]));
  if (eventIds.length === 0) return [];

  const { data: events } = await admin
    .from('events')
    .select('id, title, status, starts_at, timezone, visibility, venue_kind, hidden_reason, host_profile_id')
    .in('id', eventIds);

  const profileIds = Array.from(
    new Set([
      ...reports.map((r) => r.reporter_profile_id).filter((x): x is string => !!x),
      ...((events ?? []) as Array<{ host_profile_id: string | null }>).map((e) => e.host_profile_id).filter((x): x is string => !!x),
    ]),
  );
  const { data: people } = profileIds.length
    ? await admin.from('profiles').select('id, first_name, last_name, church_id, host_blocked_at').in('id', profileIds)
    : { data: [] };
  const byId = new Map(
    ((people ?? []) as Array<{ id: string; first_name: string; last_name: string; church_id: string | null; host_blocked_at: string | null }>).map((p) => [p.id, p]),
  );
  const name = (id: string | null) => {
    const p = id ? byId.get(id) : null;
    return p ? `${p.first_name} ${p.last_name}`.trim() || 'A member' : 'A former member';
  };

  return ((events ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    starts_at: string;
    timezone: string;
    visibility: string;
    venue_kind: string;
    hidden_reason: string | null;
    host_profile_id: string | null;
  }>)
    .map((e) => ({
      event: {
        ...e,
        host_name: name(e.host_profile_id),
        host_blocked: Boolean(e.host_profile_id && byId.get(e.host_profile_id)?.host_blocked_at),
      },
      reports: reports
        .filter((r) => r.event_id === e.id)
        .map((r) => ({
          id: r.id,
          reason: r.reason,
          note: r.note,
          created_at: r.created_at,
          reporter_name: name(r.reporter_profile_id),
          reporter_from_this_church: r.reporter_profile_id ? byId.get(r.reporter_profile_id)?.church_id === churchId : false,
        })),
    }))
    .sort((a, b) => (a.event.status === 'hidden' ? -1 : 1) - (b.event.status === 'hidden' ? -1 : 1));
}
