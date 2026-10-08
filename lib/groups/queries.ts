import 'server-only';

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/dal';
import type { GroupRow, GroupWithCounts } from '@/lib/events/types';

/**
 * Group reads. Like events, visibility is enforced by RLS (migration 026):
 * staff see every group in their church, ordinary members see non-private
 * groups plus any private group they belong to. Nothing here re-implements
 * that.
 */

/** Groups the current user may see, with member counts and membership flags. */
export async function listGroups(churchId: string): Promise<GroupWithCounts[]> {
  const session = await getSession();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('groups')
    .select('*, parent:groups!groups_parent_group_id_fkey ( id, name )')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to load groups: ${error.message}`);

  const rows = (data ?? []) as Array<GroupRow & { parent: { name: string } | null }>;
  if (rows.length === 0) return [];

  // Counts and membership come from service-role: a member can't enumerate
  // other groups' rosters, but a count is safe and the directory needs it.
  const admin = await createServiceRoleClient();
  const { data: memberRows } = await admin
    .from('group_members')
    .select('group_id, profile_id')
    .in(
      'group_id',
      rows.map((r) => r.id),
    );

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const m of (memberRows ?? []) as Array<{ group_id: string; profile_id: string }>) {
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
    if (session && m.profile_id === session.id) mine.add(m.group_id);
  }

  return rows.map((r) => ({
    ...r,
    member_count: counts.get(r.id) ?? 0,
    parent_name: r.parent?.name ?? null,
    is_member: mine.has(r.id),
  }));
}

/** The groups the current user belongs to — drives the hub's group filter. */
export async function listMyGroups(): Promise<Array<Pick<GroupRow, 'id' | 'name'>>> {
  const session = await getSession();
  if (!session) return [];

  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('group_members')
    .select('group:groups ( id, name, is_active )')
    .eq('profile_id', session.id);

  return ((data ?? []) as unknown as Array<{ group: { id: string; name: string; is_active: boolean } | null }>)
    .map((r) => r.group)
    .filter((g): g is { id: string; name: string; is_active: boolean } => !!g && g.is_active)
    .map((g) => ({ id: g.id, name: g.name }));
}

export async function getGroup(groupId: string): Promise<GroupRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  return (data as GroupRow | null) ?? null;
}

export interface GroupMemberView {
  profile_id: string;
  first_name: string;
  /** Full last name for leaders and staff; an initial for other members. */
  last_name: string | null;
  role: 'member' | 'leader';
  joined_at: string;
}

/**
 * Roster for a group, through the database's own projection
 * (ec_group_roster): members see first name + last initial; leaders and
 * staff see full names; anyone else gets nothing.
 */
export async function listGroupMembers(groupId: string): Promise<GroupMemberView[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc('ec_group_roster', { gid: groupId });
  return ((data ?? []) as GroupMemberView[]).map((r) => ({ ...r, first_name: r.first_name ?? '' }));
}

export interface GroupDetail {
  group: GroupRow;
  parentName: string | null;
  leaderName: string | null;
  members: GroupMemberView[];
  isMember: boolean;
  isLeader: boolean;
  /** campus_admin+ in the group's church (or platform admin). */
  canAdmin: boolean;
  /** Admins and the group's leaders manage the roster. */
  canManageRoster: boolean;
  upcoming: Array<{ id: string; title: string; starts_at: string; timezone: string; status: string }>;
}

export async function getGroupDetail(groupId: string): Promise<GroupDetail | null> {
  const session = await getSession();
  if (!session) return null;
  const supabase = await createServerSupabaseClient();

  // RLS: staff, members, and (for non-private, non-youth groups) the church.
  const { data: groupRow } = await supabase.from('groups').select('*').eq('id', groupId).maybeSingle();
  const group = groupRow as GroupRow | null;
  if (!group) return null;

  const admin = await createServiceRoleClient();
  const [members, parent, leader, eventIds] = await Promise.all([
    listGroupMembers(groupId),
    group.parent_group_id
      ? admin.from('groups').select('name').eq('id', group.parent_group_id).maybeSingle()
      : Promise.resolve({ data: null }),
    group.leader_profile_id
      ? admin.from('profiles').select('first_name, last_name').eq('id', group.leader_profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('event_audiences').select('event_id').eq('group_id', groupId),
  ]);

  const ids = ((eventIds.data ?? []) as Array<{ event_id: string }>).map((r) => r.event_id);
  const { data: upcoming } = ids.length
    ? await supabase
        .from('events')
        .select('id, title, starts_at, timezone, status')
        .in('id', ids)
        .in('status', ['published', 'cancelled'])
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(8)
    : { data: [] };

  const p = session.profile;
  const canAdmin =
    Boolean(p?.is_platform_admin) ||
    (p?.church_id === group.church_id && (p?.role === 'church_admin' || p?.role === 'campus_admin'));
  const mine = members.find((m) => m.profile_id === session.id);
  const isLeader = mine?.role === 'leader' || group.leader_profile_id === session.id;
  const l = leader.data as { first_name: string; last_name: string } | null;

  return {
    group,
    parentName: (parent.data as { name: string } | null)?.name ?? null,
    leaderName: l ? `${l.first_name} ${l.last_name}`.trim() : null,
    members,
    isMember: Boolean(mine),
    isLeader,
    canAdmin,
    canManageRoster: canAdmin || isLeader,
    upcoming: (upcoming ?? []) as GroupDetail['upcoming'],
  };
}

/**
 * People an admin can add to a group: everyone at their church, through
 * RLS (campus admins and church admins may read their church's profiles).
 * Not available to leaders, who add by exact email instead.
 */
export async function listChurchPeopleForPicker(churchId: string): Promise<Array<{ id: string; name: string; email: string | null }>> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .eq('church_id', churchId)
    .order('first_name')
    .limit(2000);
  return ((data ?? []) as Array<{ id: string; first_name: string; last_name: string; email: string | null }>).map((r) => ({
    id: r.id,
    name: `${r.first_name} ${r.last_name}`.trim() || r.email || 'Unnamed',
    email: r.email,
  }));
}
