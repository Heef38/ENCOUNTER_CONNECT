import type { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth/dal';
import { buildNavGroups, defaultHomeFromGroups } from '@/lib/auth/nav';
import { ECNav } from '@/components/layout/ec-nav';

export default async function ECLayout({ children }: { children: ReactNode }) {
  const session = await requireAuth();
  const groups = await buildNavGroups(session);
  const homeHref = defaultHomeFromGroups(groups);

  const userLabel =
    [session.profile?.first_name, session.profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || session.email;

  return (
    <div className="min-h-screen bg-background">
      <ECNav groups={groups} userLabel={userLabel} homeHref={homeHref} />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
