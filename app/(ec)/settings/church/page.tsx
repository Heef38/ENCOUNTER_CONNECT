import Link from 'next/link';
import { requireChurchAdmin } from '@/lib/auth/dal';
import { getChurchContext } from '@/lib/church/context';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ChurchSettingsForm } from './settings-form';
import { AgreementCard } from './agreement-card';
import { CHURCH_AGREEMENT_VERSION } from '@/lib/church/agreement';

export default async function ChurchSettingsPage() {
  const session = await requireChurchAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return <p className="text-sm text-foreground-muted">No church context.</p>;
  const church = await getChurchContext(churchId);
  if (!church) return <p className="text-sm text-foreground-muted">Church not found.</p>;
  const admin = await createServiceRoleClient();
  const { data: row } = await admin
    .from('churches')
    .select('description, service_times, listed_on_map, verified_at')
    .eq('id', churchId)
    .maybeSingle();
  const r = row as {
    description: string | null;
    service_times: string | null;
    listed_on_map: boolean;
    verified_at: string | null;
  } | null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">Church settings</h1>
        <p className="mt-1 text-sm text-foreground-muted">The handful of choices that are yours to make for {church.name}.</p>
      </header>
      <AgreementCard
        churchName={church.name}
        currentVersion={CHURCH_AGREEMENT_VERSION}
        acceptedVersion={church.settings.agreement_version}
        acceptedOn={church.settings.agreement_accepted_at}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <span className="text-foreground-muted">
          Everything your church has here, as one file: people, contact notes, groups, gatherings, RSVPs and the audit log.
        </span>
        <a href="/settings/church/export" className="font-medium text-primary hover:underline" download>
          Export our church
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <span className="text-foreground-muted">A printable QR code for your public page, for Sunday&apos;s slides and the welcome table.</span>
        <Link href="/settings/church/qr" className="font-medium text-primary hover:underline">
          Your QR code
        </Link>
      </div>
      <ChurchSettingsForm
        church={{
          name: church.name,
          connect_name: church.connect_name,
          description: r?.description ?? null,
          service_times: r?.service_times ?? null,
          listed_on_map: r?.listed_on_map ?? false,
          verified: Boolean(r?.verified_at),
        }}
        settings={church.settings}
      />
    </div>
  );
}
