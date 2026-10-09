import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PUBLIC_CHURCH_COOKIE } from './public-church-cookie';
import type { Church } from './types';

/**
 * Tenant resolution for anonymous visitors.
 *
 * The problem: `/` is now the connection hub, and a logged-out visitor should
 * see that church's public events. But URLs carry no church slug — a signed-in
 * user's church comes from `profiles.church_id`, and `churches.slug` is
 * reserved for future subdomain routing. So an anonymous request has no tenant
 * context at all.
 *
 * Resolution order, most explicit first:
 *   1. `?church=<slug>` on the request — an explicit, shareable choice.
 *   2. The `ec_last_church` cookie, set by any visit to `/c/[slug]`.
 *   3. The only active church, when the platform has exactly one.
 *   4. null — the hub falls back to the login hero + a link to /signup.
 *
 * Step 3 is what makes this correct today (one real church) while degrading
 * sanely later: the moment a second church onboards, an un-hinted visitor
 * stops getting a wrong-tenant guess and gets the chooser instead. The clean
 * long-term answer is `/c/[slug]/hub` as the canonical public URL, or
 * subdomains — both of which this function is compatible with.
 *
 * Anonymous visitors can't read `churches` through RLS, so this uses the
 * service-role client. It only ever returns public branding fields.
 *
 * Only churches the platform has verified, and never the test church, can
 * be the front door's guess (rethink §7.1). An unverified church's own
 * page at /c/<slug> still works for its people; it just isn't presented
 * from the platform's front door until it is verified.
 */

export { PUBLIC_CHURCH_COOKIE, publicChurchCookieOptions } from './public-church-cookie';

export type PublicChurch = Pick<
  Church,
  'id' | 'name' | 'slug' | 'timezone' | 'logo_url' | 'brand_color' | 'description'
>;

const PUBLIC_CHURCH_FIELDS =
  'id, name, slug, timezone, logo_url, brand_color, description';

/** Why we ended up on this church — the hub uses it to decide whether to
 *  offer a "not your church?" switcher. */
export type PublicChurchSource = 'query' | 'cookie' | 'only_church' | 'none';

export interface PublicChurchResolution {
  church: PublicChurch | null;
  source: PublicChurchSource;
  /** True when more than one active church exists, so the guess is ambiguous. */
  hasMultiple: boolean;
}

async function findBySlug(slug: string): Promise<PublicChurch | null> {
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('churches')
    .select(PUBLIC_CHURCH_FIELDS)
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('is_test', false)
    .not('verified_at', 'is', null)
    .maybeSingle();
  return (data as PublicChurch | null) ?? null;
}

/**
 * Resolves the church whose public events an anonymous visitor should see.
 * `slugFromQuery` comes from the page's own searchParams — this function
 * deliberately doesn't reach for the request URL itself so it stays usable
 * from any server component.
 */
export const resolvePublicChurch = cache(
  async (slugFromQuery?: string): Promise<PublicChurchResolution> => {
    const admin = await createServiceRoleClient();

    // How many active churches exist at all? Drives both step 3 and whether
    // the UI should offer a switcher.
    const { data: activeRows } = await admin
      .from('churches')
      .select(PUBLIC_CHURCH_FIELDS)
      .eq('is_active', true)
      .eq('is_test', false)
      .not('verified_at', 'is', null)
      .not('slug', 'is', null)
      .limit(2);

    const active = (activeRows as PublicChurch[] | null) ?? [];
    const hasMultiple = active.length > 1;

    // 1. Explicit query param.
    if (slugFromQuery) {
      const church = await findBySlug(slugFromQuery);
      if (church) return { church, source: 'query', hasMultiple };
      // A bad slug falls through rather than 404s — the visitor still gets
      // a usable page.
    }

    // 2. Cookie left by a previous visit to /c/[slug].
    const jar = await cookies();
    const cookieSlug = jar.get(PUBLIC_CHURCH_COOKIE)?.value;
    if (cookieSlug) {
      const church = await findBySlug(cookieSlug);
      if (church) return { church, source: 'cookie', hasMultiple };
    }

    // 3. Exactly one active church — no ambiguity to resolve.
    if (active.length === 1) {
      return { church: active[0], source: 'only_church', hasMultiple };
    }

    // 4. Nothing to go on.
    return { church: null, source: 'none', hasMultiple };
  },
);

/**
 * Lists active churches for the "which church?" chooser the hub shows when
 * resolution comes up empty and more than one exists.
 */
export async function listPublicChurches(): Promise<PublicChurch[]> {
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('churches')
    .select(PUBLIC_CHURCH_FIELDS)
    .eq('is_active', true)
    .eq('is_test', false)
    .not('verified_at', 'is', null)
    .not('slug', 'is', null)
    .order('name');
  return (data as PublicChurch[] | null) ?? [];
}
