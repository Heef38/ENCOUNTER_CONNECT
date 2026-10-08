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
  last_name: string;
  email: string | null;
  role: 'member' | 'leader';
  joined_at: string;
}

/** Roster for a group. RLS restricts this to staff, leaders, and members. */
export async function listGroupMembers(groupId: string): Promise<GroupMemberView[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('group_members')
    .select('profile_id, role, joined_at, profile:profiles ( first_name, last_name, email )')
    .eq('group_id', groupId)
    .order('joined_at');

  return ((data ?? []) as unknown as Array<{
    profile_id: string;
    role: 'member' | 'leader';
    joined_at: string;
    profile: { first_name: string; last_name: string; email: string | null } | null;
  }>).map((r) => ({
    profile_id: r.profile_id,
    first_name: r.profile?.first_name ?? '',
    last_name: r.profile?.last_name ?? '',
    email: r.profile?.email ?? null,
    role: r.role,
    joined_at: r.joined_at,
  }));
}
