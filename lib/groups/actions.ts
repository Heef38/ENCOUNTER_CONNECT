'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { requireAuth, requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { getChurchContext } from '@/lib/church/context';
import { dbMessage, insertGatherings, prepareEventInput } from '@/lib/events/write';
import type { GroupKind, ServiceResult } from '@/lib/events/types';

/**
 * Groups are the audience model: who can see a private gathering is decided
 * by group membership, so an accurate roster is what keeps a home group's
 * address with the home group. Staff curate rosters; a group's leader keeps
 * their own. Writes go through the caller's client, so RLS (migration 026)
 * decides: campus admins and church admins in the group's church, or the
 * group's leader, and only people from the same church can be added.
 */

const KINDS: GroupKind[] = ['roster', 'ministry', 'home_group', 'age_stage', 'interest', 'serve', 'custom'];

function fail(error: string): ServiceResult<never> {
  return { success: false, error };
}

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/** Walks the parent chain; true if `candidate` would make a loop. */
async function wouldCycle(groupId: string | null, candidate: string | null): Promise<boolean> {
  if (!candidate) return false;
  if (groupId && candidate === groupId) return true;
  const admin = await createServiceRoleClient();
  let cursor: string | null = candidate;
  for (let i = 0; i < 20 && cursor; i++) {
    if (cursor === groupId) return true;
    const { data }: { data: { parent_group_id: string | null } | null } = await admin
      .from('groups')
      .select('parent_group_id')
      .eq('id', cursor)
      .maybeSingle();
    cursor = data?.parent_group_id ?? null;
  }
  return false;
}

function readGroupForm(fd: FormData) {
  const kindRaw = text(fd, 'kind') ?? 'custom';
  return {
    name: text(fd, 'name'),
    kind: (KINDS.includes(kindRaw as GroupKind) ? kindRaw : 'custom') as GroupKind,
    description: text(fd, 'description'),
    campus_id: text(fd, 'campus_id'),
    parent_group_id: text(fd, 'parent_group_id'),
    is_private: fd.get('is_private') === 'on',
    is_youth: fd.get('is_youth') === 'on',
    leader_profile_id: text(fd, 'leader_profile_id'),
  };
}

async function setLeader(groupId: string, profileId: string | null, addedBy: string) {
  if (!profileId) return null;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: groupId, profile_id: profileId, role: 'leader', added_by_profile_id: addedBy }, { onConflict: 'group_id,profile_id' });
  return error;
}

export async function createGroup(formData: FormData): Promise<ServiceResult<{ id: string }>> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return fail('No church context.');

  const g = readGroupForm(formData);
  if (!g.name) return fail('Give the group a name.');
  if (g.name.length > 120) return fail('Keep the name under 120 characters.');

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('groups')
    .insert({ ...g, church_id: churchId })
    .select('id')
    .single();
  if (error || !data) return fail(dbMessage(error, 'Could not create the group.'));

  const leaderErr = await setLeader(data.id, g.leader_profile_id, session.id);
  if (leaderErr) return fail(dbMessage(leaderErr, 'The group was created, but the leader could not be added.'));

  await recordAudit({ action: 'group.create', entity_type: 'group', entity_id: data.id, metadata: { name: g.name, kind: g.kind, is_youth: g.is_youth } });
  revalidatePath('/groups');
  return { success: true, data: { id: data.id } };
}

export async function updateGroup(groupId: string, formData: FormData): Promise<ServiceResult<{ id: string }>> {
  const session = await requireCampusAdmin();
  const g = readGroupForm(formData);
  if (!g.name) return fail('Give the group a name.');
  if (await wouldCycle(groupId, g.parent_group_id)) {
    return fail('That parent group is inside this group already.');
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('groups').update(g).eq('id', groupId).select('id');
  if (error) return fail(dbMessage(error, 'Could not save the group.'));
  if (!data || data.length === 0) return fail('Only an admin of this church can edit the group.');

  const leaderErr = await setLeader(groupId, g.leader_profile_id, session.id);
  if (leaderErr) return fail(dbMessage(leaderErr, 'Saved, but the leader could not be added.'));

  await recordAudit({ action: 'group.update', entity_type: 'group', entity_id: groupId, metadata: { name: g.name } });
  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return { success: true, data: { id: groupId } };
}

export async function archiveGroup(groupId: string): Promise<ServiceResult<null>> {
  await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('groups').update({ is_active: false }).eq('id', groupId).select('id');
  if (error) return fail(dbMessage(error, 'Could not archive the group.'));
  if (!data || data.length === 0) return fail('Only an admin of this church can archive the group.');
  await recordAudit({ action: 'group.archive', entity_type: 'group', entity_id: groupId });
  revalidatePath('/groups');
  return { success: true, data: null };
}

/** Staff pick from their church's people. */
export async function addGroupMember(groupId: string, profileId: string): Promise<ServiceResult<null>> {
  const session = await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: groupId, profile_id: profileId, role: 'member', added_by_profile_id: session.id }, { onConflict: 'group_id,profile_id', ignoreDuplicates: true });
  if (error) return fail(dbMessage(error, 'Could not add them.'));
  await recordAudit({ action: 'group.member_add', entity_type: 'group', entity_id: groupId, metadata: { profile_id: profileId } });
  revalidatePath(`/groups/${groupId}`);
  return { success: true, data: null };
}

/**
 * Leaders add people by their exact email address. There is no member
 * directory to browse: a leader can add someone they already know, and
 * the database only accepts people from the group's own church.
 */
export async function addGroupMemberByEmail(groupId: string, email: string): Promise<ServiceResult<{ name: string }>> {
  const session = await requireAuth();
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail('Enter their email address.');

  const admin = await createServiceRoleClient();
  const { data: group } = await admin.from('groups').select('id, church_id').eq('id', groupId).maybeSingle();
  if (!group) return fail('Group not found.');
  const { data: person } = await admin
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('church_id', group.church_id)
    .ilike('email', clean)
    .maybeSingle();
  // Same answer whether the email is unknown or belongs to another church:
  // this is not a lookup tool.
  if (!person) return fail("We couldn't find someone at your church with that email. They may need to sign up first.");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: groupId, profile_id: person.id, role: 'member', added_by_profile_id: session.id }, { onConflict: 'group_id,profile_id', ignoreDuplicates: true });
  if (error) return fail(dbMessage(error, 'Only the group’s leader or an admin can add people.'));

  await recordAudit({ action: 'group.member_add', entity_type: 'group', entity_id: groupId, metadata: { profile_id: person.id, by: 'email' } });
  revalidatePath(`/groups/${groupId}`);
  return { success: true, data: { name: `${person.first_name} ${person.last_name}`.trim() } };
}

export async function removeGroupMember(groupId: string, profileId: string): Promise<ServiceResult<null>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('profile_id', profileId)
    .select('id');
  if (error) return fail(dbMessage(error, 'Could not remove them.'));
  if (!data || data.length === 0) return fail('Only the group’s leader or an admin can change the roster.');
  await recordAudit({ action: 'group.member_remove', entity_type: 'group', entity_id: groupId, metadata: { profile_id: profileId } });
  revalidatePath(`/groups/${groupId}`);
  return { success: true, data: null };
}

export async function setGroupMemberRole(groupId: string, profileId: string, role: 'member' | 'leader'): Promise<ServiceResult<null>> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', groupId)
    .eq('profile_id', profileId)
    .select('id');
  if (error) return fail(dbMessage(error, 'Could not change their role.'));
  if (!data || data.length === 0) return fail('Only the group’s leader or an admin can change roles.');
  await recordAudit({ action: 'group.member_role', entity_type: 'group', entity_id: groupId, metadata: { profile_id: profileId, role } });
  revalidatePath(`/groups/${groupId}`);
  return { success: true, data: null };
}

/** One click from Settings → Serve Teams: the team becomes a serve group. */
export async function createGroupFromServeTeam(serveTeamId: string): Promise<ServiceResult<{ id: string }>> {
  const session = await requireCampusAdmin();
  const supabase = await createServerSupabaseClient();
  const { data: team } = await supabase
    .from('serve_teams')
    .select('id, church_id, campus_id, name, description, leader_profile_id')
    .eq('id', serveTeamId)
    .maybeSingle();
  if (!team) return fail('Serve team not found.');

  const { data: existing } = await supabase.from('groups').select('id').eq('serve_team_id', serveTeamId).maybeSingle();
  if (existing) return { success: true, data: { id: existing.id } };

  const { data, error } = await supabase
    .from('groups')
    .insert({
      church_id: team.church_id,
      campus_id: team.campus_id,
      name: team.name,
      description: team.description,
      kind: 'serve',
      leader_profile_id: team.leader_profile_id,
      serve_team_id: team.id,
    })
    .select('id')
    .single();
  if (error || !data) return fail(dbMessage(error, 'Could not create the group.'));
  await setLeader(data.id, team.leader_profile_id, session.id);

  await recordAudit({ action: 'group.from_serve_team', entity_type: 'group', entity_id: data.id, metadata: { serve_team_id: team.id } });
  revalidatePath('/groups');
  return { success: true, data: { id: data.id } };
}

/**
 * "Start a home group": the roster and its weekly gatherings in one step.
 * A church says "home group" for both the people and Tuesday night, so the
 * admin creates both together: a private group with its leader, and N
 * weekly gatherings at the leader's home, private to the group, hosted by
 * the leader, address held until RSVP.
 */
export async function startHomeGroup(formData: FormData): Promise<ServiceResult<{ groupId: string; eventId: string }>> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return fail('No church context.');
  const church = await getChurchContext(churchId);
  if (!church) return fail('Church not found.');

  const name = text(formData, 'name');
  const leaderId = text(formData, 'leader_profile_id');
  const date = text(formData, 'date');
  const start = text(formData, 'start_time') ?? '18:30';
  const end = text(formData, 'end_time') ?? '20:30';
  const weeks = Math.min(Math.max(Number(text(formData, 'weeks') ?? '8') || 8, 1), 12);
  const address = text(formData, 'address_line1');
  const city = text(formData, 'city');
  if (!name || !leaderId || !date || !address || !city) {
    return fail('Add a name, a leader, the first date, and the home’s address and city.');
  }

  const supabase = await createServerSupabaseClient();
  const admin = await createServiceRoleClient();
  const { data: homeType } = await admin
    .from('event_types')
    .select('id')
    .eq('church_id', churchId)
    .eq('default_venue_kind', 'home')
    .eq('is_active', true)
    .order('order_index')
    .limit(1)
    .maybeSingle();
  if (!homeType) return fail('Add a home-group gathering type in settings first.');

  const { data: group, error: groupErr } = await supabase
    .from('groups')
    .insert({
      church_id: churchId,
      campus_id: text(formData, 'campus_id'),
      name,
      kind: 'home_group',
      description: text(formData, 'description'),
      leader_profile_id: leaderId,
    })
    .select('id')
    .single();
  if (groupErr || !group) return fail(dbMessage(groupErr, 'Could not create the group.'));
  const leaderErr = await setLeader(group.id, leaderId, session.id);
  if (leaderErr) {
    await admin.from('groups').delete().eq('id', group.id);
    return fail(dbMessage(leaderErr, 'Could not add the leader.'));
  }

  const input = {
    event_type_id: homeType.id,
    title: name,
    description: text(formData, 'description') ?? undefined,
    date,
    start_time: start,
    end_time: end,
    campus_id: text(formData, 'campus_id'),
    visibility: 'private' as const,
    audience_is_church_wide: false,
    group_ids: [group.id],
    invite_ring: 'members_only' as const,
    venue_kind: 'home' as const,
    address_line1: address,
    city,
    region: text(formData, 'region') ?? undefined,
    postal_code: text(formData, 'postal_code') ?? undefined,
    hide_address_until_rsvp: true,
    repeat_weeks: weeks,
    publish: true,
  };
  const prepared = prepareEventInput(input, true);
  if (!prepared.success) {
    await admin.from('groups').delete().eq('id', group.id);
    return prepared;
  }
  const created = await insertGatherings(supabase, {
    input,
    prepared: prepared.data,
    churchId,
    timezone: church.timezone,
    hostProfileId: leaderId,
    invitedBy: session.id,
  });
  if (!created.success) {
    await admin.from('groups').delete().eq('id', group.id);
    return created;
  }

  await recordAudit({
    action: 'group.start_home_group',
    entity_type: 'group',
    entity_id: group.id,
    metadata: { leader_profile_id: leaderId, weeks: created.data.ids.length, series_id: created.data.seriesId },
  });
  revalidatePath('/groups');
  revalidatePath('/');
  return { success: true, data: { groupId: group.id, eventId: created.data.ids[0] } };
}
