import 'server-only';

import { createServiceRoleClient } from '@/lib/supabase/server';
import type { ChurchContext } from './context';

export interface StartStep {
  key: string;
  title: string;
  detail: string;
  href: string;
  done: boolean;
}

/**
 * A new church's first afternoon, as facts: each step is done when the
 * thing it asks for exists, so the list can't drift from reality. Shown
 * to church admins on This week until every step is done.
 */
export async function gettingStarted(church: ChurchContext): Promise<StartStep[]> {
  const admin = await createServiceRoleClient();
  const id = church.id;
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [pinnedCampuses, staff, members, gatherings, flows, row] = await Promise.all([
    count(admin.from('campuses').select('id', { count: 'exact', head: true }).eq('church_id', id).eq('is_active', true).not('lat', 'is', null)),
    count(admin.from('profiles').select('id', { count: 'exact', head: true }).eq('church_id', id).neq('role', 'participant')),
    count(admin.from('participants').select('id', { count: 'exact', head: true }).eq('church_id', id).eq('joined_as', 'member')),
    count(admin.from('events').select('id', { count: 'exact', head: true }).eq('church_id', id).eq('status', 'published')),
    count(admin.from('flows').select('id', { count: 'exact', head: true }).eq('church_id', id).eq('is_active', true)),
    admin.from('churches').select('connect_name, slug, listed_on_map, verified_at').eq('id', id).maybeSingle(),
  ]);
  const c = row.data as { connect_name: string | null; slug: string | null; listed_on_map: boolean; verified_at: string | null } | null;
  const mode = church.settings.journey_mode;

  return [
    {
      key: 'name',
      title: 'Name your connect ministry',
      detail: 'What your people see, like "Seminole Connect".',
      href: '/settings/church',
      done: Boolean(c?.connect_name),
    },
    {
      key: 'agreement',
      title: 'Accept the church agreement',
      detail: 'One page on whose information it is and who does what.',
      href: '/settings/church',
      done: Boolean(church.settings.agreement_accepted_at),
    },
    {
      key: 'campus',
      title: 'Put your campus on the map',
      detail: 'Add its address so gatherings at church show in the right place.',
      href: '/settings/campuses',
      done: pinnedCampuses > 0,
    },
    {
      key: 'welcome',
      title: 'Choose how you welcome people',
      detail: 'A video journey, a membership class, simple next steps, or a handshake.',
      href: mode === 'simple' && flows === 0 ? '/flows/new' : '/settings/church',
      done: mode === 'none' || (mode !== null && flows > 0),
    },
    {
      key: 'team',
      title: 'Invite your team',
      detail: 'The people who will welcome newcomers and look after them.',
      href: '/people/invite',
      done: staff > 1,
    },
    {
      key: 'people',
      title: 'Bring in the people who already belong',
      detail: 'Import a Planning Center export or a spreadsheet, or invite them one by one.',
      href: '/people/import',
      done: members > 0,
    },
    {
      key: 'gathering',
      title: 'Publish a first gathering',
      detail: 'A home group, a prayer night, a newcomers lunch.',
      href: '/hub/new',
      done: gatherings > 0,
    },
    {
      key: 'map',
      title: 'Join the shared map',
      detail: 'Let people nearby find your church. ChurchConnect verifies you first.',
      href: '/settings/church',
      done: Boolean(c?.listed_on_map && c?.verified_at),
    },
  ];
}
