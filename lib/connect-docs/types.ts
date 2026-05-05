export type DocVisibility = 'staff' | 'participants' | 'public';

export interface ConnectDoc {
  id: string;
  church_id: string;
  campus_id: string | null;
  title: string;
  description: string | null;
  body: string | null;
  file_url: string | null;
  visibility: DocVisibility;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectDocInput {
  church_id: string;
  title: string;
  campus_id?: string;
  description?: string;
  body?: string;
  file_url?: string;
  visibility?: DocVisibility;
}

export interface UpdateConnectDocInput {
  title?: string;
  campus_id?: string | null;
  description?: string;
  body?: string;
  file_url?: string;
  visibility?: DocVisibility;
  is_active?: boolean;
}
