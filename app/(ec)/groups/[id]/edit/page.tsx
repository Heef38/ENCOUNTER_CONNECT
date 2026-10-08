import { notFound } from 'next/navigation';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { getGroup, listChurchPeopleForPicker, listGroups } from '@/lib/groups/queries';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { GroupForm } from '../../group-form';

export default async function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCampusAdmin();
  const group = await getGroup(id);
  if (!group) notFound();
  const supabase = await createServerSupabaseClient();
  const [groups, people, campuses] = await Promise.all([
    listGroups(group.church_id),
    listChurchPeopleForPicker(group.church_id),
    supabase.from('campuses').select('id, name').eq('church_id', group.church_id).eq('is_active', true).order('name'),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Edit {group.name}</h1>
      <div className="mt-6">
        <GroupForm
          group={group}
          campuses={(campuses.data ?? []) as Array<{ id: string; name: string }>}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          people={people}
        />
      </div>
    </div>
  );
}
