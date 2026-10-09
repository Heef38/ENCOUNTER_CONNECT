import type { ECUserRole } from '@/lib/church/types';

export interface InviteRow {
  id: string;
  church_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: ECUserRole;
  campus_id: string | null;
  participant_id: string | null;
  group_ids: string[];
  nonce: string;
  invited_by: string | null;
  created_at: string;
  expires_at: string;
  last_sent_at: string | null;
  send_count: number;
  accepted_at: string | null;
  accepted_profile_id: string | null;
  revoked_at: string | null;
}

export type InviteState = 'open' | 'expired' | 'accepted' | 'revoked';

export function inviteState(i: Pick<InviteRow, 'accepted_at' | 'revoked_at' | 'expires_at'>, now = new Date()): InviteState {
  if (i.accepted_at) return 'accepted';
  if (i.revoked_at) return 'revoked';
  if (new Date(i.expires_at) <= now) return 'expired';
  return 'open';
}

/** How the role reads in an invite: "to help lead", "as a member". */
export function rolePhrase(role: ECUserRole): string {
  switch (role) {
    case 'church_admin':
      return 'as a church admin';
    case 'campus_admin':
      return 'as a campus admin';
    case 'connector':
      return 'as a connector, helping welcome new people';
    default:
      return 'as a member';
  }
}

export function roleLabel(role: ECUserRole): string {
  switch (role) {
    case 'church_admin':
      return 'Church admin';
    case 'campus_admin':
      return 'Campus admin';
    case 'connector':
      return 'Connector';
    default:
      return 'Member';
  }
}

export const STAFF_ROLES: ECUserRole[] = ['church_admin', 'campus_admin', 'connector'];

const RANK: Record<ECUserRole, number> = { participant: 0, connector: 1, campus_admin: 2, church_admin: 3 };

/** The higher of two roles: an invite never lowers someone. */
export function higherRole(a: ECUserRole, b: ECUserRole): ECUserRole {
  return RANK[a] >= RANK[b] ? a : b;
}
