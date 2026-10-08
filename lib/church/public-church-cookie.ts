/**
 * Cookie constants for anonymous church resolution, kept in their own module
 * with no imports.
 *
 * `proxy.ts` writes this cookie and `lib/church/public-church.ts` reads it, but
 * that reader pulls in `next/headers` and `server-only` — neither of which
 * belongs in the proxy bundle. Splitting the constants out lets both sides
 * share one definition without dragging the server-only graph into the proxy.
 */

export const PUBLIC_CHURCH_COOKIE = 'ec_last_church';

/** One year, lax. A display preference, not a credential — never treated as
 *  permission to see anything. */
export const publicChurchCookieOptions = {
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
} as const;
