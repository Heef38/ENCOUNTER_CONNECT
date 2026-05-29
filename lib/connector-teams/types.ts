import type { ServiceResult } from '@/lib/scheduling/types';

export type { ServiceResult };

// ── Connector team ────────────────────────────────────────────

export interface ConnectorTeam {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  scheduling_resource_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberProfile {
  connector_id: string;
  profile_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export interface ConnectorTeamWithMembers extends ConnectorTeam {
  campus: { id: string; name: string } | null;
  members: TeamMemberProfile[];
}

/** Lightweight team summary used by scheduling + availability code paths. */
export interface ConnectorTeamSummary {
  teamId: string;
  name: string;
  resourceId: string | null;
  memberConnectorIds: string[];
}

/** A connector's team, as resolved during slot aggregation. */
export interface ConnectorTeamRef {
  teamId: string;
  resourceId: string | null;
}
