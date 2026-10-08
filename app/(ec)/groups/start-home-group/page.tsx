import { requireCampusAdmin } from '@/lib/auth/dal';
import { listChurchPeopleForPicker } from '@/lib/groups/queries';
import { getChurchContext } from '@/lib/church/context';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { zoneAbbreviation } from '@/lib/time/zoned';
import { StartHomeGroupForm } from './start-form';

export default async function StartHomeGroupPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">No church context.</p>;
  const supabase = await createServerSupabaseClient();
  const [people, campuses, church] = await Promise.all([
    listChurchPeopleForPicker(churchId),
    supabase.from('campuses').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name'),
    getChurchContext(churchId),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Start a home group</h1>
      <p className="mt-1 text-sm text-foreground-muted">The group and its weekly gatherings, in one step.</p>
      <div className="mt-6">
        <StartHomeGroupForm
          people={people}
          campuses={(campuses.data ?? []) as Array<{ id: string; name: string }>}
          zoneLabel={church ? zoneAbbreviation(new Date().toISOString(), church.timezone) : 'your church’s time'}
        />
      </div>
    </div>
  );
}
