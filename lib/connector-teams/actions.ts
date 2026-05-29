'use server';

import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const DEFAULT_TZ = 'America/Chicago';

function nullable(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v ? v : null;
}

interface ValidatedPair {
  ok: true;
  a: string;
  b: string;
}

/**
 * Validates that two connector ids are a usable pair for a team: distinct,
 * both found, both active, both in this church. `excludeTeamId` lets an
 * update keep the team's own existing members without tripping the
 * "already on a team" check.
 */
async function validatePair(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  churchId: string,
  a: string | null,
  b: string | null,
  excludeTeamId: string | null,
): Promise<ValidatedPair | { ok: false; error: string }> {
  if (!a || !b) return { ok: false, error: 'Pick two connectors.' };
  if (a === b) return { ok: false, error: 'Pick two different connectors.' };

  const { data: conns } = await admin
    .from('connectors')
    .select('id, church_id, is_active')
    .in('id', [a, b]);
  const list = (conns ?? []) as Array<{ id: string; church_id: string | null; is_active: boolean }>;
  if (list.length !== 2) return { ok: false, error: 'Could not find both connectors.' };
  for (const c of list) {
    if (c.church_id !== churchId) {
      return { ok: false, error: 'Both connectors must belong to your church.' };
    }
    if (!c.is_active) return { ok: false, error: 'Both connectors must be active.' };
  }

  // Neither may already belong to a different team.
  let q = admin.from('connector_team_members').select('connector_id, team_id').in('connector_id', [a, b]);
  if (excludeTeamId) q = q.neq('team_id', excludeTeamId);
  const { data: existing } = await q;
  if ((existing ?? []).length > 0) {
    return { ok: false, error: 'One of those connectors is already on a team.' };
  }

  return { ok: true, a, b };
}

async function resolveTimezone(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  churchId: string,
): Promise<string> {
  const { data: church } = await admin
    .from('churches')
    .select('timezone')
    .eq('id', churchId)
    .maybeSingle();
  return (church?.timezone as string) || DEFAULT_TZ;
}

async function validateCampus(
  admin: Awaited<ReturnType<typeof createServiceRoleClient>>,
  churchId: string,
  campusId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!campusId) return { ok: true };
  const { data: campus } = await admin
    .from('campuses')
    .select('id, church_id')
    .eq('id', campusId)
    .maybeSingle();
  if (!campus || campus.church_id !== churchId) {
    return { ok: false, error: 'That campus is not part of your church.' };
  }
  return { ok: true };
}

/**
 * Creates a team of exactly two connectors with a shared scheduling
 * resource (the team's single availability calendar). Campus-admin+.
 */
export async function createTeam(formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const name = String(formData.get('name') ?? '').trim();
  const campus_id = nullable(formData.get('campus_id'));
  const a = nullable(formData.get('connector_a'));
  const b = nullable(formData.get('connector_b'));

  if (!name) return { ok: false, error: 'Enter a team name.' };

  const admin = await createServiceRoleClient();

  const pair = await validatePair(admin, churchId, a, b, null);
  if (!pair.ok) return pair;
  const campusCheck = await validateCampus(admin, churchId, campus_id);
  if (!campusCheck.ok) return { ok: false, error: campusCheck.error };

  const timezone = await resolveTimezone(admin, churchId);

  // Shared availability calendar for the team.
  const { data: resource, error: resErr } = await admin
    .from('scheduling_resources')
    .insert({ name, kind: 'person', timezone, default_capacity: 1 })
    .select('id')
    .single();
  if (resErr || !resource) {
    return { ok: false, error: resErr?.message ?? 'Could not create shared calendar.' };
  }

  const { data: team, error: teamErr } = await admin
    .from('connector_teams')
    .insert({
      church_id: churchId,
      campus_id,
      name,
      scheduling_resource_id: resource.id,
      is_active: true,
    })
    .select('id')
    .single();
  if (teamErr || !team) {
    await admin.from('scheduling_resources').delete().eq('id', resource.id);
    return { ok: false, error: teamErr?.message ?? 'Could not create team.' };
  }

  const { error: memErr } = await admin.from('connector_team_members').insert([
    { team_id: team.id, connector_id: pair.a },
    { team_id: team.id, connector_id: pair.b },
  ]);
  if (memErr) {
    await admin.from('connector_teams').delete().eq('id', team.id);
    await admin.from('scheduling_resources').delete().eq('id', resource.id);
    return { ok: false, error: memErr.message };
  }

  await recordAudit({
    action: 'connector_team.create',
    entity_type: 'connector_team',
    entity_id: team.id as string,
    metadata: { church_id: churchId, campus_id, connector_ids: [pair.a, pair.b] },
  });

  revalidatePath('/connectors/teams');
  revalidatePath('/connectors');
  revalidatePath('/people');
  return { ok: true, id: team.id as string };
}

/**
 * Updates a team's name, campus, active flag, and member pair. The two
 * member selects are always submitted; if they differ from the current
 * pair the membership is reconciled (validated, then replaced).
 */
export async function updateTeam(id: string, formData: FormData): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const admin = await createServiceRoleClient();

  const { data: team } = await admin
    .from('connector_teams')
    .select('id, church_id, scheduling_resource_id')
    .eq('id', id)
    .maybeSingle();
  if (!team || team.church_id !== churchId) {
    return { ok: false, error: 'Team not found.' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const campus_id = nullable(formData.get('campus_id'));
  const is_active = formData.get('is_active') === 'on';
  const a = nullable(formData.get('connector_a'));
  const b = nullable(formData.get('connector_b'));

  if (!name) return { ok: false, error: 'Enter a team name.' };

  const campusCheck = await validateCampus(admin, churchId, campus_id);
  if (!campusCheck.ok) return { ok: false, error: campusCheck.error };

  // Reconcile members only when the submitted pair differs from the current.
  const { data: currentMembers } = await admin
    .from('connector_team_members')
    .select('connector_id')
    .eq('team_id', id);
  const current = new Set(
    (currentMembers ?? []).map((m) => (m as { connector_id: string }).connector_id),
  );
  const submitted = new Set([a, b].filter(Boolean) as string[]);
  const pairChanged =
    submitted.size === 2 && (current.size !== 2 || ![...submitted].every((c) => current.has(c)));

  if (pairChanged) {
    const pair = await validatePair(admin, churchId, a, b, id);
    if (!pair.ok) return pair;
    const { error: delErr } = await admin
      .from('connector_team_members')
      .delete()
      .eq('team_id', id);
    if (delErr) return { ok: false, error: delErr.message };
    const { error: insErr } = await admin.from('connector_team_members').insert([
      { team_id: id, connector_id: pair.a },
      { team_id: id, connector_id: pair.b },
    ]);
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error } = await admin
    .from('connector_teams')
    .update({ name, campus_id, is_active })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  // Keep the shared resource's display name in sync with the team name.
  if (team.scheduling_resource_id) {
    await admin
      .from('scheduling_resources')
      .update({ name })
      .eq('id', team.scheduling_resource_id);
  }

  await recordAudit({
    action: 'connector_team.update',
    entity_type: 'connector_team',
    entity_id: id,
    metadata: { campus_id, is_active, members_changed: pairChanged },
  });

  revalidatePath('/connectors/teams');
  revalidatePath(`/connectors/teams/${id}`);
  revalidatePath('/connectors');
  revalidatePath('/people');
  return { ok: true, id };
}

/**
 * Disbands a team. Members revert to solo scheduling (their individual
 * resources govern again). The shared calendar resource is removed.
 */
export async function deleteTeam(id: string): Promise<ActionResult> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, error: 'No church context.' };

  const admin = await createServiceRoleClient();

  const { data: team } = await admin
    .from('connector_teams')
    .select('id, church_id, scheduling_resource_id')
    .eq('id', id)
    .maybeSingle();
  if (!team || team.church_id !== churchId) {
    return { ok: false, error: 'Team not found.' };
  }

  // Deleting the team cascades connector_team_members.
  const { error } = await admin.from('connector_teams').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  // Remove the now-orphaned shared calendar (cascades its availability rules).
  if (team.scheduling_resource_id) {
    await admin.from('scheduling_resources').delete().eq('id', team.scheduling_resource_id);
  }

  await recordAudit({
    action: 'connector_team.delete',
    entity_type: 'connector_team',
    entity_id: id,
  });

  revalidatePath('/connectors/teams');
  revalidatePath('/connectors');
  revalidatePath('/people');
  return { ok: true, id };
}
