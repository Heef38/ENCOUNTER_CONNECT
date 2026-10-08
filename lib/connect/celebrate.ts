import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The shepherd's side of the console: people to celebrate and people to
 * reach. Names only, for the church's own staff (callers are staff pages).
 */

export interface PersonMoment {
  profile_id: string;
  name: string;
  detail: string;
  href: string | null;
}

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const admin = await createServiceRoleClient();
  const { data } = await admin.from('profiles').select('id, first_name, last_name').in('id', ids);
  for (const p of (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
    out.set(p.id, `${p.first_name} ${p.last_name}`.trim() || 'A member');
  }
  return out;
}

/** People whose first gathering as host went up in the last 30 days. */
export async function firstTimeHosts(churchId: string): Promise<PersonMoment[]> {
  const admin = await createServiceRoleClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: recent } = await admin
    .from('events')
    .select('id, title, host_profile_id, published_at')
    .eq('church_id', churchId)
    .in('status', ['published', 'cancelled'])
    .gte('published_at', since)
    .not('host_profile_id', 'is', null)
    .order('published_at', { ascending: true });
  const rows = (recent ?? []) as Array<{ id: string; title: string; host_profile_id: string; published_at: string }>;
  const hostIds = Array.from(new Set(rows.map((r) => r.host_profile_id)));
  if (hostIds.length === 0) return [];

  const { data: earlier } = await admin
    .from('events')
    .select('host_profile_id')
    .eq('church_id', churchId)
    .in('host_profile_id', hostIds)
    .lt('published_at', since);
  const veterans = new Set(((earlier ?? []) as Array<{ host_profile_id: string }>).map((e) => e.host_profile_id));

  // Staff host all the time; the moment worth noticing is a member's first.
  const { data: staff } = await admin.from('profiles').select('id').in('id', hostIds).neq('role', 'participant');
  const staffIds = new Set(((staff ?? []) as Array<{ id: string }>).map((s) => s.id));

  const firsts = new Map<string, { id: string; title: string }>();
  for (const r of rows) {
    if (veterans.has(r.host_profile_id) || staffIds.has(r.host_profile_id) || firsts.has(r.host_profile_id)) continue;
    firsts.set(r.host_profile_id, { id: r.id, title: r.title });
  }
  const n = await names(Array.from(firsts.keys()));
  return Array.from(firsts.entries()).map(([pid, e]) => ({
    profile_id: pid,
    name: n.get(pid) ?? 'A member',
    detail: `Hosted for the first time: ${e.title}`,
    href: `/hub/e/${e.id}`,
  }));
}

/**
 * Regulars who have gone missing: checked in at two or more gatherings in
 * the 90 days before last month, and at none in the last 30 days.
 */
export async function regularsNotSeen(churchId: string): Promise<PersonMoment[]> {
  const admin = await createServiceRoleClient();
  const now = Date.now();
  const windowStart = new Date(now - 120 * 864e5).toISOString();
  const recentCut = now - 30 * 864e5;
  const { data } = await admin
    .from('event_rsvps')
    .select('profile_id, attended_at, event:events!inner ( church_id )')
    .eq('event.church_id', churchId)
    .not('attended_at', 'is', null)
    .gte('attended_at', windowStart);
  const byPerson = new Map<string, { before: number; recent: number; last: number }>();
  for (const r of (data ?? []) as unknown as Array<{ profile_id: string; attended_at: string }>) {
    const t = new Date(r.attended_at).getTime();
    const e = byPerson.get(r.profile_id) ?? { before: 0, recent: 0, last: 0 };
    if (t >= recentCut) e.recent += 1;
    else e.before += 1;
    e.last = Math.max(e.last, t);
    byPerson.set(r.profile_id, e);
  }
  const missing = Array.from(byPerson.entries()).filter(([, e]) => e.before >= 2 && e.recent === 0);
  const n = await names(missing.map(([pid]) => pid));
  return missing
    .sort((a, b) => a[1].last - b[1].last)
    .slice(0, 12)
    .map(([pid, e]) => ({
      profile_id: pid,
      name: n.get(pid) ?? 'A member',
      detail: `Last came ${Math.round((now - e.last) / 864e5)} days ago`,
      href: null,
    }));
}

/** Open reports waiting for this church's review. */
export async function openReportCount(churchId: string): Promise<number> {
  const admin = await createServiceRoleClient();
  const { count } = await admin
    .from('event_reports')
    .select('id, event:events!inner ( church_id )', { count: 'exact', head: true })
    .eq('event.church_id', churchId)
    .is('resolved_at', null);
  return count ?? 0;
}
