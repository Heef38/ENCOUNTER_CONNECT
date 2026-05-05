import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Connector ─────────────────────────────────────────────────

export interface Connector {
  id: string;
  profile_id: string;
  campus_id: string | null;
  scheduling_resource_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectorWithProfile extends Connector {
  profile: {
    first_name: string;
    last_name: string;
    email: string | null;
  };
  campus: { id: string; name: string } | null;
}

export interface ConnectorWithStats extends ConnectorWithProfile {
  participant_count: number;
}

// ── Inputs ────────────────────────────────────────────────────

export interface CreateConnectorInput {
  profile_id: string;
  campus_id?: string;
  scheduling_resource_id?: string;
}

export interface UpdateConnectorInput {
  campus_id?: string;
  scheduling_resource_id?: string;
  is_active?: boolean;
}

// ── Filters ───────────────────────────────────────────────────

export interface ListConnectorsFilter {
  campus_id?: string;
  is_active?: boolean;
}
