import { requireCampusAdmin } from '@/lib/auth/dal';
import { listChurchPeopleForPicker, listGroups } from '@/lib/groups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { GroupForm } from '../group-form';

export default async function NewGroupPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">No church context.</p>;
  const supabase = await createServerSupabaseClient();
  const [groups, people, campuses] = await Promise.all([
    listGroups(churchId),
    listChurchPeopleForPicker(churchId),
    supabase.from('campuses').select('id, name').eq('church_id', churchId).eq('is_active', true).order('name'),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">New group</h1>
      <div className="mt-6">
        <GroupForm
          campuses={(campuses.data ?? []) as Array<{ id: string; name: string }>}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          people={people}
        />
      </div>
    </div>
  );
}
