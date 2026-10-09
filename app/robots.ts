import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/** Only the public face is for crawlers; everything signed-in is not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/c/', '/hub/e/', '/privacy', '/terms'],
      disallow: ['/invite/', '/auth/', '/api/', '/account', '/dashboard', '/people', '/participants', '/settings', '/platform', '/connector', '/journey', '/scheduling'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
