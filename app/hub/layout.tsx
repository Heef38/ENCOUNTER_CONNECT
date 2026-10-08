import type { ReactNode } from 'react';
import { getSession } from '@/lib/auth/dal';
import { buildNavGroups } from '@/lib/auth/nav';
import { ECNav } from '@/components/layout/ec-nav';

/**
 * Hub layout. Deliberately does NOT require auth: an anonymous visitor can open
 * a public event's detail page from the hub at `/`, so the gate lives in each
 * page (and ultimately in the `events` RLS policy) rather than here.
 */
export default async function HubLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  const groups = session ? await buildNavGroups(session) : [];
  const userLabel = session
    ? [session.profile?.first_name, session.profile?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim() || session.email
    : null;

  return (
    <div className="min-h-screen bg-background">
      <ECNav groups={groups} userLabel={userLabel} homeHref="/" />
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
