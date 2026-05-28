import 'server-only';

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { SessionUser } from '@/lib/auth/dal';

export interface DashboardContext {
  session: SessionUser;
  isAdmin: boolean;
  isConnector: boolean;
  myConnectorId: string | null;
}

export interface DashboardPills {
  activeConnections: number;
  newThisWeek: number;
  needsAttention: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  participantName: string | null;
  participantId: string | null;
  location: string | null;
  /** Hex color from scheduling_appointment_types.color, if set. */
  typeColor: string | null;
  /** Per-booking override; wins over typeColor. */
  displayColor: string | null;
}

export interface PlateItem {
  progressId: string;
  participantId: string;
  participantName: string;
  stepTitle: string;
  stepType: string;
  bookingStartsAt: string | null;
  ageDays: number;
}

export interface AttentionBucket {
  count: number;
  items: Array<{ id: string; primary: string; secondary: string }>;
}

export interface NeedsAttention {
  unassigned: AttentionBucket;
  stalled: AttentionBucket;
  overdueBookings: AttentionBucket;
}

export interface ConnectorLoadRow {
  connectorId: string;
  name: string;
  activeCount: number;
  avgDaysSinceAction: number | null;
  isHeavy: boolean;
}

export interface InProgressRow {
  id: string;
  firstName: string;
  lastName: string;
  campusName: string | null;
  stepTitle: string | null;
  connectorName: string | null;
  lastActionAt: string | null;
}

const HEAVY_LOAD_THRESHOLD = 10;
const STALLED_DAYS = 14;

export async function getDashboardContext(session: SessionUser): Promise<DashboardContext> {
  const supabase = await createServerSupabaseClient();
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const isAdmin = isPlatform || role === 'church_admin' || role === 'campus_admin';

  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id')
    .eq('profile_id', session.id)
    .eq('is_active', true)
    .maybeSingle();

  return {
    session,
    isAdmin,
    isConnector: !!connectorRow,
    myConnectorId: connectorRow?.id ?? null,
  };
}

export async function getPills(ctx: DashboardContext): Promise<DashboardPills> {
  const supabase = await createServerSupabaseClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const stalledCutoff = new Date(Date.now() - STALLED_DAYS * 86_400_000).toISOString();

  const [{ count: active }, { count: newWeek }, { count: unassigned }, { count: stalled }] =
    await Promise.all([
      supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress'),
      supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo),
      supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .is('assigned_connector_id', null)
        .in('status', ['new', 'in_progress']),
      supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'in_progress')
        .lt('last_action_at', stalledCutoff),
    ]);

  const needsAttention = ctx.isAdmin ? (unassigned ?? 0) + (stalled ?? 0) : 0;

  return {
    activeConnections: active ?? 0,
    newThisWeek: newWeek ?? 0,
    needsAttention,
  };
}

interface ProgressBookingRow {
  scheduled_event_id: string;
  participant: {
    id: string;
    first_name: string;
    last_name: string;
    assigned_connector_id: string | null;
    church_id: string;
  } | null;
  booking: {
    id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    display_color: string | null;
    location: { name: string | null } | null;
    appointment_type: { color: string | null } | null;
  } | null;
}

export async function getMonthBookings(
  ctx: DashboardContext,
  monthStart: Date,
  monthEnd: Date,
  scope: 'all' | 'mine',
): Promise<CalendarEvent[]> {
  // Service-role: bookings aren't readable by EC staff under RLS (the inner
  // embed would drop every row). Scope + month-filter in JS to stay tenant-safe
  // and avoid unreliable embedded-column filters.
  const supabase = await createServiceRoleClient();
  const churchId = ctx.session.profile?.is_platform_admin
    ? null
    : ctx.session.profile?.church_id ?? null;

  const { data } = await supabase
    .from('participant_progress')
    .select(
      `scheduled_event_id,
       participant:participants!inner(id, first_name, last_name, assigned_connector_id, church_id),
       booking:scheduling_bookings!inner(
         id, title, starts_at, ends_at, display_color,
         location:scheduling_locations(name),
         appointment_type:scheduling_appointment_types(color)
       )`,
    )
    .not('scheduled_event_id', 'is', null)
    .limit(500);

  const rows = (data ?? []) as unknown as ProgressBookingRow[];
  const startMs = monthStart.getTime();
  const endMs = monthEnd.getTime();

  return rows
    .filter((r) => r.booking && r.participant)
    .filter((r) => churchId === null || r.participant!.church_id === churchId)
    .filter((r) => {
      const t = new Date(r.booking!.starts_at).getTime();
      return t >= startMs && t < endMs;
    })
    .filter((r) => scope !== 'mine' || !ctx.myConnectorId || r.participant!.assigned_connector_id === ctx.myConnectorId)
    .map((r) => ({
      id: r.booking!.id,
      title: r.booking!.title ?? 'Appointment',
      starts_at: r.booking!.starts_at,
      ends_at: r.booking!.ends_at,
      participantName: `${r.participant!.first_name} ${r.participant!.last_name}`,
      participantId: r.participant!.id,
      location: r.booking!.location?.name ?? null,
      typeColor: r.booking!.appointment_type?.color ?? null,
      displayColor: r.booking!.display_color ?? null,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

interface PlateQueryRow {
  id: string;
  status: string;
  created_at: string;
  participant: {
    id: string;
    first_name: string;
    last_name: string;
    assigned_connector_id: string | null;
  } | null;
  flow_step: { title: string; step_type: string } | null;
  booking: { starts_at: string } | null;
}

export async function getMyPlate(ctx: DashboardContext): Promise<PlateItem[]> {
  if (!ctx.myConnectorId) return [];
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from('participant_progress')
    .select(
      `id, status, created_at,
       participant:participants!inner(id, first_name, last_name, assigned_connector_id),
       flow_step:flow_steps(title, step_type),
       booking:scheduling_bookings(starts_at)`,
    )
    .in('status', ['pending', 'in_progress'])
    .eq('participant.assigned_connector_id', ctx.myConnectorId)
    .limit(50);

  const rows = (data ?? []) as unknown as PlateQueryRow[];
  const now = Date.now();

  return rows
    .filter((r) => r.participant && r.flow_step)
    .map((r) => ({
      progressId: r.id,
      participantId: r.participant!.id,
      participantName: `${r.participant!.first_name} ${r.participant!.last_name}`,
      stepTitle: r.flow_step!.title,
      stepType: r.flow_step!.step_type,
      bookingStartsAt: r.booking?.starts_at ?? null,
      ageDays: Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000),
    }))
    .sort((a, b) => {
      if (a.bookingStartsAt && b.bookingStartsAt) {
        return a.bookingStartsAt.localeCompare(b.bookingStartsAt);
      }
      if (a.bookingStartsAt) return -1;
      if (b.bookingStartsAt) return 1;
      return b.ageDays - a.ageDays;
    })
    .slice(0, 10);
}

export interface ActivityItem {
  id: string;
  at: string;
  title: string;
  detail: string | null;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

function humanize(s: string): string {
  const t = s.replace(/[._]/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Recent activity for the dashboard: notifications that went out (or are
 * queued/failed) plus audit-log status updates, newest first. Church-scoped
 * via RLS + an explicit filter; platform admins see all.
 */
export async function getRecentActivity(ctx: DashboardContext): Promise<ActivityItem[]> {
  const supabase = await createServerSupabaseClient();
  const churchId = ctx.session.profile?.is_platform_admin
    ? null
    : ctx.session.profile?.church_id ?? null;

  let notifQ = supabase
    .from('notification_outbox')
    .select(
      'id, created_at, status, channel, recipient_name, recipient_email, recipient_phone, subject, template_key',
    )
    .order('created_at', { ascending: false })
    .limit(12);
  if (churchId) notifQ = notifQ.eq('church_id', churchId);

  let auditQ = supabase
    .from('audit_log')
    .select('id, created_at, action, entity_type, actor_label')
    .order('created_at', { ascending: false })
    .limit(12);
  if (churchId) auditQ = auditQ.eq('church_id', churchId);

  const [{ data: notifs }, { data: audits }] = await Promise.all([notifQ, auditQ]);

  const notifTone = (status: string): ActivityItem['tone'] =>
    status === 'sent'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'skipped'
          ? 'neutral'
          : 'info';

  const items: ActivityItem[] = [];

  for (const n of notifs ?? []) {
    const row = n as {
      id: string;
      created_at: string;
      status: string;
      channel: string;
      recipient_name: string | null;
      recipient_email: string | null;
      recipient_phone: string | null;
      subject: string | null;
      template_key: string | null;
    };
    const recipient = row.recipient_name ?? row.recipient_email ?? row.recipient_phone ?? 'someone';
    items.push({
      id: `n_${row.id}`,
      at: row.created_at,
      title: row.subject ?? humanize(row.template_key ?? 'Notification'),
      detail: `${row.channel} → ${recipient} · ${row.status}`,
      tone: notifTone(row.status),
    });
  }

  for (const a of audits ?? []) {
    const row = a as {
      id: string;
      created_at: string;
      action: string;
      entity_type: string | null;
      actor_label: string | null;
    };
    items.push({
      id: `a_${row.id}`,
      at: row.created_at,
      title: humanize(row.action),
      detail: [row.entity_type, row.actor_label].filter(Boolean).join(' · ') || null,
      tone: 'neutral',
    });
  }

  return items.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, 15);
}

export async function getNeedsAttention(ctx: DashboardContext): Promise<NeedsAttention> {
  if (!ctx.isAdmin) {
    return {
      unassigned: { count: 0, items: [] },
      stalled: { count: 0, items: [] },
      overdueBookings: { count: 0, items: [] },
    };
  }

  const supabase = await createServerSupabaseClient();
  const stalledCutoff = new Date(Date.now() - STALLED_DAYS * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();

  const [unassignedRes, stalledRes, overdueRes] = await Promise.all([
    supabase
      .from('participants')
      .select('id, first_name, last_name, created_at, campus:campuses(name)', {
        count: 'exact',
      })
      .is('assigned_connector_id', null)
      .in('status', ['new', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('participants')
      .select('id, first_name, last_name, last_action_at, campus:campuses(name)', {
        count: 'exact',
      })
      .eq('status', 'in_progress')
      .lt('last_action_at', stalledCutoff)
      .order('last_action_at', { ascending: true })
      .limit(3),
    supabase
      .from('participant_progress')
      .select(
        `id,
         participant:participants!inner(first_name, last_name),
         booking:scheduling_bookings!inner(id, title, starts_at, status, completed_at)`,
        { count: 'exact' },
      )
      .not('scheduled_event_id', 'is', null)
      .lt('booking.starts_at', nowIso)
      .is('booking.completed_at', null)
      .in('booking.status', ['pending_confirmation', 'confirmed'])
      .limit(25),
  ]);

  const overdueRows = ((overdueRes.data ?? []) as unknown as Array<{
    id: string;
    participant: { first_name: string; last_name: string } | null;
    booking: { id: string; title: string | null; starts_at: string } | null;
  }>)
    .filter((r) => r.booking && r.participant)
    .sort((a, b) => b.booking!.starts_at.localeCompare(a.booking!.starts_at))
    .slice(0, 3);

  return {
    unassigned: {
      count: unassignedRes.count ?? 0,
      items: (unassignedRes.data ?? []).slice(0, 3).map((p) => {
        const row = p as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          campus: { name: string } | null;
        };
        return {
          id: row.id,
          primary: `${row.first_name} ${row.last_name}`,
          secondary: row.campus?.name ?? 'No campus',
        };
      }),
    },
    stalled: {
      count: stalledRes.count ?? 0,
      items: (stalledRes.data ?? []).map((p) => {
        const row = p as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          last_action_at: string | null;
        };
        const days = row.last_action_at
          ? Math.floor((Date.now() - new Date(row.last_action_at).getTime()) / 86_400_000)
          : null;
        return {
          id: row.id,
          primary: `${row.first_name} ${row.last_name}`,
          secondary: days != null ? `${days}d since last action` : 'No activity',
        };
      }),
    },
    overdueBookings: {
      count: overdueRes.count ?? 0,
      items: overdueRows
        .filter((r) => r.booking && r.participant)
        .map((r) => ({
          id: r.booking!.id,
          primary: r.booking!.title ?? 'Appointment',
          secondary: `${r.participant!.first_name} ${r.participant!.last_name}`,
        })),
    },
  };
}

export async function getConnectorLoad(ctx: DashboardContext): Promise<ConnectorLoadRow[]> {
  if (!ctx.isAdmin) return [];
  const supabase = await createServerSupabaseClient();

  const { data: connectors } = await supabase
    .from('connectors')
    .select(
      `id, profile:profiles(first_name, last_name)`,
    )
    .eq('is_active', true);

  const { data: active } = await supabase
    .from('participants')
    .select('assigned_connector_id, last_action_at')
    .in('status', ['new', 'in_progress', 'connected'])
    .not('assigned_connector_id', 'is', null);

  const byConnector = new Map<string, { count: number; totalDays: number; measured: number }>();
  const now = Date.now();
  for (const p of active ?? []) {
    const row = p as { assigned_connector_id: string; last_action_at: string | null };
    const entry = byConnector.get(row.assigned_connector_id) ?? {
      count: 0,
      totalDays: 0,
      measured: 0,
    };
    entry.count += 1;
    if (row.last_action_at) {
      entry.totalDays += (now - new Date(row.last_action_at).getTime()) / 86_400_000;
      entry.measured += 1;
    }
    byConnector.set(row.assigned_connector_id, entry);
  }

  return ((connectors ?? []) as unknown as Array<{
    id: string;
    profile: { first_name: string; last_name: string } | null;
  }>)
    .map((c) => {
      const stats = byConnector.get(c.id);
      const activeCount = stats?.count ?? 0;
      return {
        connectorId: c.id,
        name: c.profile
          ? `${c.profile.first_name} ${c.profile.last_name}`.trim() || 'Unnamed'
          : 'Unnamed',
        activeCount,
        avgDaysSinceAction:
          stats && stats.measured > 0 ? Math.round(stats.totalDays / stats.measured) : null,
        isHeavy: activeCount >= HEAVY_LOAD_THRESHOLD,
      };
    })
    .sort((a, b) => b.activeCount - a.activeCount);
}

interface InProgressQueryRow {
  id: string;
  first_name: string;
  last_name: string;
  last_action_at: string | null;
  assigned_connector_id: string | null;
  campus: { name: string } | null;
  current_step: { title: string } | null;
  connector: {
    profile: { first_name: string; last_name: string } | null;
  } | null;
}

export async function getInProgressConnections(ctx: DashboardContext): Promise<InProgressRow[]> {
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from('participants')
    .select(
      `id, first_name, last_name, last_action_at, assigned_connector_id,
       campus:campuses(name),
       current_step:flow_steps!participants_current_step_id_fkey(title),
       connector:connectors(profile:profiles(first_name, last_name))`,
    )
    .eq('status', 'in_progress')
    .order('last_action_at', { ascending: false, nullsFirst: false })
    .limit(25);

  if (!ctx.isAdmin && ctx.myConnectorId) {
    q = q.eq('assigned_connector_id', ctx.myConnectorId);
  }

  const { data } = await q;
  const rows = (data ?? []) as unknown as InProgressQueryRow[];

  return rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    campusName: r.campus?.name ?? null,
    stepTitle: r.current_step?.title ?? null,
    connectorName: r.connector?.profile
      ? `${r.connector.profile.first_name} ${r.connector.profile.last_name}`.trim() || null
      : null,
    lastActionAt: r.last_action_at,
  }));
}
