import { requireChurchAdmin } from '@/lib/auth/dal';
import { getChurchContext } from '@/lib/church/context';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ChurchSettingsForm } from './settings-form';

export default async function ChurchSettingsPage() {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">No church context.</p>;
  const church = await getChurchContext(churchId);
  if (!church) return <p className="text-sm text-foreground-muted">Church not found.</p>;
  const admin = await createServiceRoleClient();
  const { data: row } = await admin
    .from('churches')
    .select('description, listed_on_map, verified_at')
    .eq('id', churchId)
    .maybeSingle();
  const r = row as { description: string | null; listed_on_map: boolean; verified_at: string | null } | null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Church settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">The handful of choices that are yours to make for {church.name}.</p>
      </header>
      <ChurchSettingsForm
        church={{
          name: church.name,
          connect_name: church.connect_name,
          description: r?.description ?? null,
          listed_on_map: r?.listed_on_map ?? false,
          verified: Boolean(r?.verified_at),
        }}
        settings={church.settings}
      />
    </div>
  );
}
