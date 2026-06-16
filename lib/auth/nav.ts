import 'server-only';

import type { SessionUser } from './dal';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export type NavGroupKey = 'platform' | 'admin' | 'connector' | 'participant';

export interface NavItem {
  href?: string;
  label: string;
  /** When present, this item is a dropdown of sub-links instead of a link. */
  children?: NavItem[];
}

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  /**
   * Token mapped to a CSS variable in globals.css. Render as
   * `style={{ '--nav-accent': `var(--${color})` }}` etc.
   */
  color: 'info' | 'success' | 'warning' | 'primary';
  items: NavItem[];
}

// The "Journey" dropdown groups the content that makes up a participant's journey.
const JOURNEY_CHILDREN: NavItem[] = [
  { href: '/flows',                     label: 'Flows' },
  { href: '/settings/connect-docs',     label: 'Connect Docs' },
  { href: '/settings/lessons',          label: 'Lessons' },
  { href: '/settings/appointment-types', label: 'Appointment Types' },
  { href: '/settings/assessments',      label: 'Assessments' },
];

// "Settings" is itself a dropdown of the remaining admin links (no hub page).
const SETTINGS_CHILDREN: NavItem[] = [
  { href: '/settings/serve-teams',  label: 'Serve Teams' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/audit',                 label: 'Audit log' },
];

/**
 * Builds the role-grouped nav for a session. Each group the user is
 * eligible for renders as a labeled colored bracket in the header.
 * The same set of groups appears regardless of which platform page
 * they're currently on (admin / connector / participant).
 */
export async function buildNavGroups(session: SessionUser): Promise<NavGroup[]> {
  const groups: NavGroup[] = [];
  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const isCampusAdmin = isPlatform || role === 'church_admin' || role === 'campus_admin';
  const isChurchAdmin = isPlatform || role === 'church_admin';

  if (isPlatform) {
    groups.push({
      key: 'platform',
      label: 'Platform',
      color: 'warning',
      items: [
        { href: '/platform/churches',  label: 'Churches' },
        { href: '/platform/test-data', label: 'Test data' },
      ],
    });
  }

  if (isCampusAdmin) {
    const items: NavItem[] = [
      { href: '/dashboard',        label: 'Dashboard' },
      {
        label: 'People',
        children: [
          { href: '/people',     label: 'All' },
          { href: '/connectors', label: 'Connectors' },
        ],
      },
      { href: '/appointments',     label: 'Appointments' },
      { label: 'Journey',          children: JOURNEY_CHILDREN },
      { href: '/reports',          label: 'Reports' },
      { href: '/settings/campuses', label: 'Campuses' },
    ];
    // Settings is a dropdown of the remaining links — church-admin only.
    if (isChurchAdmin) items.push({ label: 'Settings', children: SETTINGS_CHILDREN });
    groups.push({
      key: 'admin',
      label: 'Admin',
      color: 'info',
      items,
    });
  }

  // Connector membership comes from a connectors row, regardless of the
  // profile.role enum. A church admin who's also walking participants
  // through the journey will have a connectors row.
  const supabase = await createServerSupabaseClient();
  const { data: connectorRow } = await supabase
    .from('connectors')
    .select('id')
    .eq('profile_id', session.id)
    .eq('is_active', true)
    .maybeSingle();
  if (connectorRow) {
    groups.push({
      key: 'connector',
      label: 'Connector',
      color: 'success',
      items: [
        { href: '/connector',              label: 'My participants' },
        { href: '/connector/campus',       label: 'All campus' },
        { href: '/connector/availability', label: 'My availability' },
      ],
    });
  }

  if (role === 'participant') {
    groups.push({
      key: 'participant',
      label: 'Participant',
      color: 'primary',
      items: [{ href: '/journey', label: 'My journey' }],
    });
  }

  return groups;
}

/**
 * Picks the default home href for a session based on highest-privilege
 * available platform. Replaces the /landing redirect: instead of forcing
 * the user to choose, we land them somewhere sensible and the nav lets
 * them jump between groups.
 */
export function defaultHomeFromGroups(groups: NavGroup[]): string {
  if (groups.length === 0) return '/journey';
  if (groups.find((g) => g.key === 'admin')) return '/dashboard';
  if (groups.find((g) => g.key === 'platform')) return '/platform/churches';
  if (groups.find((g) => g.key === 'connector')) return '/connector';
  return '/journey';
}
