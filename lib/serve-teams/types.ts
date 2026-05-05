export interface ServeTeam {
  id: string;
  church_id: string;
  campus_id: string | null;
  name: string;
  description: string | null;
  leader_profile_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateServeTeamInput {
  church_id: string;
  name: string;
  campus_id?: string;
  description?: string;
  leader_profile_id?: string;
}

export interface UpdateServeTeamInput {
  name?: string;
  campus_id?: string | null;
  description?: string;
  leader_profile_id?: string | null;
  is_active?: boolean;
}
