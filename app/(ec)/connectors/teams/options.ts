import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorOption } from './team-form';

export async function loadCampuses(
  supabase: SupabaseClient,
  churchId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from('campuses')
    .select('id, name')
    .eq('church_id', churchId)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * Active connectors in the church eligible to be paired into a team —
 * i.e. not already on a team OTHER than `keepTeamId` (pass the team being
 * edited so its current members stay selectable).
 */
export async function loadConnectorOptions(
  supabase: SupabaseClient,
  churchId: string,
  keepTeamId?: string | null,
): Promise<ConnectorOption[]> {
  const [{ data: conns }, { data: members }] = await Promise.all([
    supabase
      .from('connectors')
      .select('id, profile:profiles!connectors_profile_id_fkey(first_name, last_name)')
      .eq('church_id', churchId)
      .eq('is_active', true),
    supabase.from('connector_team_members').select('connector_id, team_id'),
  ]);

  const taken = new Set(
    ((members ?? []) as Array<{ connector_id: string; team_id: string }>)
      .filter((m) => !keepTeamId || m.team_id !== keepTeamId)
      .map((m) => m.connector_id),
  );

  type ConnRow = {
    id: string;
    profile: { first_name: string; last_name: string } | null;
  };
  return ((conns ?? []) as unknown as ConnRow[])
    .filter((c) => !taken.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.profile
        ? `${c.profile.first_name} ${c.profile.last_name}`.trim() || 'Connector'
        : 'Connector',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
