import 'server-only';

import type { SessionUser } from '@/lib/auth/dal';
import { getChurchContext } from '@/lib/church/context';
import { connectName } from '@/lib/brand';
import type { NavBrand } from '@/components/layout/ec-nav';

/** The nav brand for a signed-in person: their church's logo and connect name. */
export async function brandForSession(session: SessionUser | null): Promise<NavBrand | null> {
  const churchId = session?.profile?.church_id;
  if (!churchId) return null;
  const church = await getChurchContext(churchId);
  if (!church) return null;
  return { name: connectName(church), logoUrl: church.logo_url };
}
