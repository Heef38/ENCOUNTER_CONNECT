import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ConnectorTeamRef,
  ConnectorTeamSummary,
  ConnectorTeamWithMembers,
  TeamMemberProfile,
} from './types';

/** Summary of a single team: name, shared resource, and member connector ids. */
export async function getTeamSummary(
  client: SupabaseClient,
  teamId: string,
): Promise<ConnectorTeamSummary | null> {
  const { data: team } = await client
    .from('connector_teams')
    .select('id, name, scheduling_resource_id')
    .eq('id', teamId)
    .maybeSingle();
  if (!team) return null;

  const { data: members } = await client
    .from('connector_team_members')
    .select('connector_id')
    .eq('team_id', teamId);

  return {
    teamId: team.id as string,
    name: team.name as string,
    resourceId: (team.scheduling_resource_id as string | null) ?? null,
    memberConnectorIds: (members ?? []).map(
      (m) => (m as { connector_id: string }).connector_id,
    ),
  };
}

/** Resolves the team a connector belongs to (active or not), or null. */
export async function getConnectorTeam(
  client: SupabaseClient,
  connectorId: string,
): Promise<ConnectorTeamSummary | null> {
  const { data: membership } = await client
    .from('connector_team_members')
    .select('team_id')
    .eq('connector_id', connectorId)
    .maybeSingle();
  if (!membership) return null;
  return getTeamSummary(client, (membership as { team_id: string }).team_id);
}

/**
 * Maps each of the given connector ids to its ACTIVE team (if any). Used by
 * slot aggregation to represent a team as a single scheduling unit and to
 * skip the members' personal resources.
 */
export async function getActiveTeamsForConnectors(
  client: SupabaseClient,
  connectorIds: string[],
): Promise<Map<string, ConnectorTeamRef>> {
  const map = new Map<string, ConnectorTeamRef>();
  if (connectorIds.length === 0) return map;

  const { data } = await client
    .from('connector_team_members')
    .select(
      'connector_id, team:connector_teams!inner(id, scheduling_resource_id, is_active)',
    )
    .in('connector_id', connectorIds);

  type Row = {
    connector_id: string;
    team: { id: string; scheduling_resource_id: string | null; is_active: boolean } | null;
  };
  for (const row of (data ?? []) as unknown as Row[]) {
    if (!row.team?.is_active) continue;
    map.set(row.connector_id, {
      teamId: row.team.id,
      resourceId: row.team.scheduling_resource_id ?? null,
    });
  }
  return map;
}

/** Lists every team in a church with its campus + member profiles. */
export async function listTeams(
  client: SupabaseClient,
  churchId: string,
): Promise<ConnectorTeamWithMembers[]> {
  const { data: teams } = await client
    .from('connector_teams')
    .select(
      'id, church_id, campus_id, name, scheduling_resource_id, is_active, created_at, updated_at, campus:campuses(id, name)',
    )
    .eq('church_id', churchId)
    .order('name');

  const teamRows = (teams ?? []) as unknown as ConnectorTeamWithMembers[];
  if (teamRows.length === 0) return [];

  const { data: memberRows } = await client
    .from('connector_team_members')
    .select(
      'team_id, connector_id, connector:connectors!inner(id, profile:profiles!connectors_profile_id_fkey(id, first_name, last_name, email))',
    )
    .in(
      'team_id',
      teamRows.map((t) => t.id),
    );

  type MRow = {
    team_id: string;
    connector_id: string;
    connector: {
      profile: {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
      } | null;
    } | null;
  };

  const byTeam = new Map<string, TeamMemberProfile[]>();
  for (const row of (memberRows ?? []) as unknown as MRow[]) {
    const profile = row.connector?.profile;
    const list = byTeam.get(row.team_id) ?? [];
    list.push({
      connector_id: row.connector_id,
      profile_id: profile?.id ?? '',
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
      email: profile?.email ?? null,
    });
    byTeam.set(row.team_id, list);
  }

  return teamRows.map((t) => ({ ...t, members: byTeam.get(t.id) ?? [] }));
}
