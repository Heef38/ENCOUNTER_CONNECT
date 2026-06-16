import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/dal';
import {
  getParticipantProgressRows,
  participantRowsToCsv,
} from '@/lib/reports/queries';

/**
 * CSV export of every participant in the admin's church, with campus,
 * connector, status, current step, and step-completion counts.
 *
 * Gated to campus_admin+ and scoped to the caller's own church. Platform
 * admins have no single church, so they get a 400 rather than a cross-tenant
 * dump.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const role = session.profile?.role;
  const isPlatform = session.profile?.is_platform_admin ?? false;
  const isCampusAdmin =
    isPlatform || role === 'church_admin' || role === 'campus_admin';
  if (!isCampusAdmin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const churchId = session.profile?.church_id ?? null;
  if (!churchId) {
    return NextResponse.json(
      { error: 'no church context for this account' },
      { status: 400 },
    );
  }

  const rows = await getParticipantProgressRows(churchId);
  const csv = participantRowsToCsv(rows);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="participants-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
