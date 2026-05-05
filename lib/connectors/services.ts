import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceResult } from '@/lib/scheduling/types';
import type {
  Connector,
  ConnectorWithProfile,
  ConnectorWithStats,
  CreateConnectorInput,
  UpdateConnectorInput,
  ListConnectorsFilter,
} from './types';
import { queryConnectors, queryConnectorById } from './queries';

export async function listConnectors(
  supabase: SupabaseClient,
  filter: ListConnectorsFilter = {},
): Promise<ServiceResult<ConnectorWithProfile[]>> {
  const { data, error } = await queryConnectors(supabase, {
    is_active: true,
    ...filter,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as unknown as ConnectorWithProfile[] };
}

export async function listConnectorsWithStats(
  supabase: SupabaseClient,
  filter: ListConnectorsFilter = {},
): Promise<ServiceResult<ConnectorWithStats[]>> {
  const connectorsResult = await listConnectors(supabase, filter);
  if (!connectorsResult.success) return connectorsResult;

  // Fetch participant counts for each connector
  const connectorIds = connectorsResult.data.map((c) => c.id);
  if (connectorIds.length === 0) return { success: true, data: [] };

  const { data: counts, error: countError } = await supabase
    .from('participants')
    .select('assigned_connector_id')
    .in('assigned_connector_id', connectorIds)
    .neq('status', 'inactive');

  if (countError) return { success: false, error: countError.message };

  const countMap = (counts ?? []).reduce<Record<string, number>>((acc, row) => {
    const cid = row.assigned_connector_id as string;
    acc[cid] = (acc[cid] ?? 0) + 1;
    return acc;
  }, {});

  const withStats: ConnectorWithStats[] = connectorsResult.data.map((c) => ({
    ...c,
    participant_count: countMap[c.id] ?? 0,
  }));

  return { success: true, data: withStats };
}

export async function getConnector(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<ConnectorWithProfile>> {
  const { data, error } = await queryConnectorById(supabase, id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as unknown as ConnectorWithProfile };
}

export async function createConnector(
  supabase: SupabaseClient,
  input: CreateConnectorInput,
): Promise<ServiceResult<Connector>> {
  if (!input.profile_id) {
    return { success: false, error: 'profile_id is required.' };
  }
  const { data, error } = await supabase
    .from('connectors')
    .insert({
      profile_id: input.profile_id,
      campus_id: input.campus_id ?? null,
      scheduling_resource_id: input.scheduling_resource_id ?? null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Connector };
}

export async function updateConnector(
  supabase: SupabaseClient,
  id: string,
  input: UpdateConnectorInput,
): Promise<ServiceResult<Connector>> {
  const { data, error } = await supabase
    .from('connectors')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as Connector };
}

export async function deactivateConnector(
  supabase: SupabaseClient,
  id: string,
): Promise<ServiceResult<Connector>> {
  return updateConnector(supabase, id, { is_active: false });
}
