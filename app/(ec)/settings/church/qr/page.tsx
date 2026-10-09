import QRCode from 'qrcode';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { getChurchContext } from '@/lib/church/context';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { connectName } from '@/lib/brand';
import { siteUrl } from '@/lib/site';
import { PrintButton } from './print-button';

/**
 * A printable card for Sunday: the church's public page as a QR code, for
 * the slides, the bulletin and the welcome table. One per campus too.
 */
export default async function ChurchQrPage() {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const church = churchId ? await getChurchContext(churchId) : null;
  if (!church?.slug) {
    return <p className="text-sm text-foreground-muted">Your church needs a web address first. Ask ChurchConnect to set one.</p>;
  }
  const admin = await createServiceRoleClient();
  const { data: campuses } = await admin
    .from('campuses')
    .select('name, slug')
    .eq('church_id', church.id)
    .eq('is_active', true)
    .not('slug', 'is', null)
    .order('name');

  const targets = [
    { label: church.name, url: `${siteUrl()}/c/${church.slug}` },
    ...((campuses ?? []) as Array<{ name: string; slug: string }>)
      .filter(() => (campuses ?? []).length > 1)
      .map((c) => ({ label: c.name, url: `${siteUrl()}/c/${church.slug}/${c.slug}` })),
  ];
  const codes = await Promise.all(
    targets.map(async (t) => ({
      ...t,
      svg: await QRCode.toString(t.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 320 }),
    })),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Your QR code</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Put it on a slide, in the bulletin, or on the welcome table. It opens your public page, where people can get
            connected.
          </p>
        </div>
        <PrintButton />
      </div>
      {codes.map((c) => (
        <section key={c.url} className="break-inside-avoid rounded-lg border border-border bg-white p-8 text-center text-black">
          <p className="text-2xl font-semibold">{connectName(church)}</p>
          <p className="mt-1 text-sm">{c.label === church.name ? 'Scan to get connected' : `${c.label} · scan to get connected`}</p>
          {/* The SVG comes from the qrcode library, rendered from our own URL. */}
          <div className="mx-auto mt-6 w-64" dangerouslySetInnerHTML={{ __html: c.svg }} />
          <p className="mt-4 break-all font-mono text-xs">{c.url}</p>
        </section>
      ))}
    </div>
  );
}
