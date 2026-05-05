import { requireConnector } from '@/lib/auth/dal';
import { buildNavGroups, defaultHomeFromGroups } from '@/lib/auth/nav';
import { ECNav } from '@/components/layout/ec-nav';

export default async function ConnectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session } = await requireConnector();
  const groups = await buildNavGroups(session);
  const homeHref = defaultHomeFromGroups(groups);

  const userLabel =
    [session.profile?.first_name, session.profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || session.email;

  return (
    <>
      <ECNav groups={groups} userLabel={userLabel} homeHref={homeHref} />
      <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </>
  );
}
