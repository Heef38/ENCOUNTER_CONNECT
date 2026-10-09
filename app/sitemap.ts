import type { MetadataRoute } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/site';

/**
 * What search engines may list: the front door, each verified church's
 * page, and its upcoming public gatherings that are not in a home. Homes,
 * cancelled gatherings and private gatherings never appear here, matching
 * the noindex on their pages. Built per request, so it never needs the
 * database at build time.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ];
  try {
    const admin = await createServiceRoleClient();
    const { data: churches } = await admin
      .from('churches')
      .select('id, slug, updated_at')
      .eq('is_active', true)
      .eq('is_test', false)
      .not('verified_at', 'is', null)
      .not('slug', 'is', null);
    const list = (churches ?? []) as Array<{ id: string; slug: string; updated_at: string | null }>;
    for (const c of list) {
      entries.push({
        url: `${base}/c/${c.slug}`,
        lastModified: c.updated_at ?? undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
    if (list.length) {
      const { data: events } = await admin
        .from('events')
        .select('id, updated_at')
        .in('church_id', list.map((c) => c.id))
        .eq('visibility', 'public')
        .eq('status', 'published')
        .neq('venue_kind', 'home')
        .gte('ends_at', new Date().toISOString())
        .order('starts_at')
        .limit(2000);
      for (const e of (events ?? []) as Array<{ id: string; updated_at: string | null }>) {
        entries.push({ url: `${base}/hub/e/${e.id}`, lastModified: e.updated_at ?? undefined, changeFrequency: 'daily', priority: 0.5 });
      }
    }
  } catch (err) {
    console.error('[sitemap] could not load churches', err);
  }
  return entries;
}
