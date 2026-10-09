import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth/dal';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/log';

/**
 * "Export our church" (rethink §7.9): everything a church has here, for a
 * church admin of that church. One JSON file by default, or one table as
 * CSV with ?table=<name>&format=csv. Read with the service role after the
 * admin check, filtered to the church on every query.
 */

export const dynamic = 'force-dynamic';

const PAGE = 1000;
type Row = Record<string, unknown>;

async function readAll(
  admin: SupabaseClient,
  table: string,
  columns: string,
  filter: { column: string; value: string } | { column: string; values: string[] },
): Promise<Row[]> {
  const out: Row[] = [];
  const valueSets = 'values' in filter ? chunk(filter.values, 200) : [[filter.value]];
  for (const values of valueSets) {
    if (values.length === 0) continue;
    for (let from = 0; ; from += PAGE) {
      const q = admin.from(table).select(columns).range(from, from + PAGE - 1);
      const { data, error } = await ('values' in filter ? q.in(filter.column, values) : q.eq(filter.column, values[0]));
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const ids = (rows: Row[]) => rows.map((r) => r.id as string);

function toCsv(rows: Row[]): string {
  const columns = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Quote everything that needs it, and neutralize spreadsheet formulas.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n');
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const churchId = session?.profile?.church_id;
  const isAdmin = session?.profile?.role === 'church_admin' || session?.profile?.is_platform_admin;
  if (!session || !churchId || !isAdmin) {
    return NextResponse.json({ error: 'Only a church admin can export the church.' }, { status: 403 });
  }

  const admin = await createServiceRoleClient();
  const byChurch = { column: 'church_id', value: churchId };
  try {
    const [church, settings, campuses, profiles, participants, touches, groups, events, invites, audit, flows, lessons] =
      await Promise.all([
        readAll(admin, 'churches', '*', { column: 'id', value: churchId }),
        readAll(admin, 'church_settings', '*', byChurch),
        readAll(admin, 'campuses', '*', byChurch),
        readAll(
          admin,
          'profiles',
          'id, role, first_name, last_name, email, phone, campus_id, sms_consent_at, sms_consent_source, trusted_host_at, host_blocked_at, created_at',
          byChurch,
        ),
        readAll(admin, 'participants', '*', byChurch),
        readAll(admin, 'participant_touches', '*', byChurch),
        readAll(admin, 'groups', '*', byChurch),
        readAll(admin, 'events', '*', byChurch),
        readAll(
          admin,
          'church_invites',
          'id, email, first_name, last_name, role, campus_id, participant_id, group_ids, invited_by, created_at, expires_at, last_sent_at, send_count, accepted_at, accepted_profile_id, revoked_at',
          byChurch,
        ),
        readAll(admin, 'audit_log', '*', byChurch),
        readAll(admin, 'flows', '*', byChurch),
        readAll(admin, 'lessons', '*', byChurch),
      ]);

    const [progress, groupMembers, addresses, audiences, eventInvites, rsvps, flowSteps] = await Promise.all([
      readAll(admin, 'participant_progress', '*', { column: 'participant_id', values: ids(participants) }),
      readAll(admin, 'group_members', '*', { column: 'group_id', values: ids(groups) }),
      readAll(admin, 'event_addresses', '*', { column: 'event_id', values: ids(events) }),
      readAll(admin, 'event_audiences', '*', { column: 'event_id', values: ids(events) }),
      readAll(admin, 'event_invites', '*', { column: 'event_id', values: ids(events) }),
      readAll(admin, 'event_rsvps', '*', { column: 'event_id', values: ids(events) }),
      readAll(admin, 'flow_steps', '*', { column: 'flow_id', values: ids(flows) }),
    ]);

    const tables: Record<string, Row[]> = {
      church,
      church_settings: settings,
      campuses,
      people_with_accounts: profiles,
      participants,
      participant_progress: progress,
      contact_log: touches,
      groups,
      group_members: groupMembers,
      gatherings: events,
      gathering_addresses: addresses,
      gathering_audiences: audiences,
      gathering_invites: eventInvites,
      rsvps,
      invites,
      flows,
      flow_steps: flowSteps,
      lessons,
      audit_log: audit,
    };

    const slug = String(church[0]?.slug ?? 'church');
    const day = new Date().toISOString().slice(0, 10);
    const table = request.nextUrl.searchParams.get('table');
    const format = request.nextUrl.searchParams.get('format');

    await recordAudit({
      action: 'church.exported',
      entity_type: 'church',
      entity_id: churchId,
      metadata: { table: table ?? 'all', format: format ?? 'json' },
    });

    if (table && format === 'csv') {
      const rows = tables[table];
      if (!rows) return NextResponse.json({ error: `No table called ${table}.` }, { status: 404 });
      return new NextResponse(toCsv(rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}-${table}-${day}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        exported_by: session.id,
        counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
        tables,
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}-export-${day}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[export] failed', err);
    return NextResponse.json({ error: 'The export failed. Try again, or contact ChurchConnect.' }, { status: 500 });
  }
}
