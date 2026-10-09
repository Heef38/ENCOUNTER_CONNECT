'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireCampusAdmin } from '@/lib/auth/dal';
import { recordAudit } from '@/lib/audit/log';
import { deliverInvite, loadInviteContext } from '@/lib/invites/deliver';
import { newInviteNonce } from '@/lib/invites/token';
import type { InviteRow } from '@/lib/invites/types';
import { normalizeDate, normalizeEmail, normalizePhone, splitGroups, type ImportRow } from './csv';

/**
 * Bring a church's people in from a CSV (a Planning Center export, a
 * spreadsheet). Members arrive as confirmed members, so they never show up
 * as newcomers; guests arrive as newcomers with the date they first came,
 * so the contact clock is honest. Re-running the same file updates people
 * instead of duplicating them (matched on their old system's id, then
 * email). Members with an email get an invite, sent now or later.
 */

export type NewGroupKind = 'home_group' | 'ministry' | 'serve' | 'interest' | 'custom';

export interface ImportRequest {
  kind: 'member' | 'guest';
  rows: ImportRow[];
  campusId: string | null;
  newGroupKind: NewGroupKind;
  sendInvites: boolean;
}

export interface ImportReport {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  invitesPrepared: number;
  invitesQueued: number;
  groupsCreated: number;
  groupLinks: number;
  /** Group memberships that wait until the person has an account. */
  groupsWaiting: number;
  skipped: Array<{ line: number; reason: string }>;
}

const MAX_ROWS = 5000;
const PAGE = 1000;
const INVITE_DAYS = 14;
/** At most this many invites per drain run, leaving room for everything else. */
const INVITES_PER_RUN = 50;
const RUN_MS = 5 * 60 * 1000;
const GROUP_KINDS: NewGroupKind[] = ['home_group', 'ministry', 'serve', 'interest', 'custom'];

interface ExistingParticipant {
  id: string;
  email: string | null;
  external_id: string | null;
  profile_id: string | null;
  joined_as: 'guest' | 'member';
  member_confirmed_at: string | null;
  status: string;
  phone: string | null;
}

async function allParticipants(admin: SupabaseClient, churchId: string): Promise<ExistingParticipant[]> {
  const out: ExistingParticipant[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('participants')
      .select('id, email, external_id, profile_id, joined_as, member_confirmed_at, status, phone')
      .eq('church_id', churchId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as ExistingParticipant[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function inChunks<T, R>(items: T[], size: number, fn: (chunk: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await fn(items.slice(i, i + size))));
  return out;
}

export async function importPeople(req: ImportRequest): Promise<ImportReport> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  const report: ImportReport = {
    ok: false,
    created: 0,
    updated: 0,
    invitesPrepared: 0,
    invitesQueued: 0,
    groupsCreated: 0,
    groupLinks: 0,
    groupsWaiting: 0,
    skipped: [],
  };
  if (!churchId) return { ...report, error: 'No church context.' };
  if (req?.kind !== 'member' && req?.kind !== 'guest') return { ...report, error: 'Choose members or guests.' };
  if (!Array.isArray(req.rows) || req.rows.length === 0) return { ...report, error: 'The file has no people in it.' };
  if (req.rows.length > MAX_ROWS) return { ...report, error: `Import at most ${MAX_ROWS} people at a time.` };
  const isMember = req.kind === 'member';
  const groupKind = GROUP_KINDS.includes(req.newGroupKind) ? req.newGroupKind : 'home_group';

  const admin = await createServiceRoleClient();
  let campusId = typeof req.campusId === 'string' && req.campusId ? req.campusId : null;
  if (!campusId && session.profile?.role === 'campus_admin') campusId = session.profile.campus_id ?? null;
  if (campusId) {
    const { data: campus } = await admin.from('campuses').select('church_id').eq('id', campusId).maybeSingle();
    if ((campus as { church_id: string } | null)?.church_id !== churchId) {
      return { ...report, error: 'That campus is not part of your church.' };
    }
  }

  // The browser's parse is only a preview: every field is checked again here.
  const rows: Array<ImportRow & { line: number }> = [];
  const seen = new Set<string>();
  req.rows.forEach((r, i) => {
    const line = i + 2;
    const first = String(r?.first_name ?? '').trim().slice(0, 100);
    if (!first) {
      report.skipped.push({ line, reason: 'No first name' });
      return;
    }
    const email = normalizeEmail(r.email);
    const external = String(r.external_id ?? '').trim().slice(0, 100) || null;
    const key = external ? `x:${external}` : email ? `e:${email}` : null;
    if (key && seen.has(key)) {
      report.skipped.push({ line, reason: 'Appears twice in the file' });
      return;
    }
    if (key) seen.add(key);
    rows.push({
      line,
      first_name: first,
      last_name: String(r.last_name ?? '').trim().slice(0, 100) || '-',
      email,
      phone: normalizePhone(r.phone),
      external_id: external,
      joined_on: normalizeDate(r.joined_on),
      groups: splitGroups(Array.isArray(r.groups) ? r.groups.join(';') : ''),
    });
  });
  if (rows.length === 0) return { ...report, error: 'No row in the file had a first name.' };

  const existing = await allParticipants(admin, churchId);
  const byExternal = new Map(existing.filter((p) => p.external_id).map((p) => [p.external_id as string, p]));
  const byEmail = new Map(existing.filter((p) => p.email).map((p) => [(p.email as string).toLowerCase(), p]));

  // Accounts that already use these emails, anywhere on the platform.
  const emails = Array.from(new Set(rows.map((r) => r.email).filter((e): e is string => !!e)));
  const accounts = await inChunks(emails, 200, async (chunk) => {
    const { data } = await admin.from('profiles').select('id, email, church_id').in('email', chunk);
    return (data ?? []) as Array<{ id: string; email: string; church_id: string | null }>;
  });
  const accountByEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a]));

  // An account already tied to a record here is never tied to a second one.
  const claimedProfiles = new Set(existing.map((p) => p.profile_id).filter((x): x is string => !!x));
  const accountHere = (email: string | null) => {
    const a = email ? accountByEmail.get(email) : undefined;
    return a && a.church_id === churchId && !claimedProfiles.has(a.id) ? a.id : null;
  };

  const now = new Date().toISOString();
  const memberFields = { joined_as: 'member', member_confirmed_at: now, member_confirmed_by: session.id };
  const matched: Array<{ row: (typeof rows)[number]; participant: ExistingParticipant }> = [];
  const fresh: Array<(typeof rows)[number]> = [];
  for (const r of rows) {
    const p = (r.external_id && byExternal.get(r.external_id)) || (r.email && byEmail.get(r.email)) || null;
    if (p) matched.push({ row: r, participant: p });
    else fresh.push(r);
  }

  // Updates: fill what is missing, and make members members. A guest
  // import never changes anyone's membership.
  const linked = new Map<number, { id: string; profile_id: string | null }>();
  for (let i = 0; i < matched.length; i += 8) {
    await Promise.all(
      matched.slice(i, i + 8).map(async ({ row, participant: p }) => {
        const patch: Record<string, unknown> = { imported_at: now };
        if (!p.external_id && row.external_id) patch.external_id = row.external_id;
        if (!p.email && row.email) patch.email = row.email;
        if (!p.phone && row.phone) patch.phone = row.phone;
        const account = p.profile_id ? null : accountHere(row.email ?? p.email);
        if (account) {
          patch.profile_id = account;
          claimedProfiles.add(account);
        }
        if (isMember && !(p.joined_as === 'member' && p.member_confirmed_at)) {
          Object.assign(patch, memberFields);
          if (p.status === 'new' || p.status === 'in_progress') patch.status = 'connected';
        }
        const { error } = await admin.from('participants').update(patch).eq('id', p.id);
        if (error) report.skipped.push({ line: row.line, reason: error.message });
        else {
          report.updated += 1;
          linked.set(row.line, { id: p.id, profile_id: (patch.profile_id as string | undefined) ?? p.profile_id });
        }
      }),
    );
  }

  // New people. Someone whose email already has an account here is linked to it.
  const inserts = fresh.map((r) => {
    const account = accountHere(r.email);
    if (account) claimedProfiles.add(account);
    return {
      church_id: churchId,
      campus_id: campusId,
      profile_id: account,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      external_id: r.external_id,
      imported_at: now,
      signed_up_at: r.joined_on ?? now,
      status: isMember ? 'connected' : 'new',
      ...(isMember ? memberFields : { joined_as: 'guest' }),
    };
  });
  for (let i = 0; i < inserts.length; i += 250) {
    const chunk = inserts.slice(i, i + 250);
    const { data, error } = await admin.from('participants').insert(chunk).select('id, profile_id');
    if (error || !data || data.length !== chunk.length) {
      fresh.slice(i, i + 250).forEach((r) => report.skipped.push({ line: r.line, reason: error?.message ?? 'Could not save' }));
      continue;
    }
    (data as Array<{ id: string; profile_id: string | null }>).forEach((d, j) => linked.set(fresh[i + j].line, d));
    report.created += data.length;
  }

  // Groups by name, created when the church doesn't have one yet.
  const wanted = new Map<string, string>();
  for (const r of rows) for (const g of r.groups) if (!wanted.has(g.toLowerCase())) wanted.set(g.toLowerCase(), g);
  const groupIdByName = new Map<string, string>();
  if (wanted.size) {
    const { data: groups } = await admin.from('groups').select('id, name').eq('church_id', churchId).limit(PAGE);
    for (const g of (groups ?? []) as Array<{ id: string; name: string }>) groupIdByName.set(g.name.trim().toLowerCase(), g.id);
    const missing = Array.from(wanted.entries()).filter(([k]) => !groupIdByName.has(k));
    if (missing.length) {
      const { data: made, error } = await admin
        .from('groups')
        .insert(missing.map(([, name]) => ({ church_id: churchId, campus_id: campusId, name, kind: groupKind })))
        .select('id, name');
      if (error) return { ...report, error: `People were saved, but the groups could not be created: ${error.message}` };
      for (const g of (made ?? []) as Array<{ id: string; name: string }>) groupIdByName.set(g.name.trim().toLowerCase(), g.id);
      report.groupsCreated = made?.length ?? 0;
    }
  }

  const memberships: Array<{ group_id: string; profile_id: string; role: 'member' }> = [];
  const inviteGroups = new Map<number, string[]>();
  for (const r of rows) {
    const ids = r.groups.map((g) => groupIdByName.get(g.toLowerCase())).filter((x): x is string => !!x);
    if (!ids.length) continue;
    const who = linked.get(r.line);
    if (!who) continue;
    if (who.profile_id) ids.forEach((gid) => memberships.push({ group_id: gid, profile_id: who.profile_id as string, role: 'member' }));
    else if (isMember && r.email) inviteGroups.set(r.line, ids);
    else report.groupsWaiting += ids.length;
  }
  if (memberships.length) {
    for (let i = 0; i < memberships.length; i += 500) {
      const { error } = await admin
        .from('group_members')
        .upsert(memberships.slice(i, i + 500), { onConflict: 'group_id,profile_id', ignoreDuplicates: true });
      if (!error) report.groupLinks += Math.min(500, memberships.length - i);
    }
  }

  // Invites: members with an email and no account yet.
  if (isMember) {
    const candidates = rows.filter((r) => {
      if (!r.email || !linked.has(r.line)) return false;
      if (accountByEmail.has(r.email)) return false;
      return !linked.get(r.line)?.profile_id;
    });
    const openInvites = await inChunks(candidates.map((c) => c.email as string), 200, async (chunk) => {
      const { data } = await admin
        .from('church_invites')
        .select('*')
        .eq('church_id', churchId)
        .in('email', chunk)
        .is('accepted_at', null)
        .is('revoked_at', null);
      return (data ?? []) as InviteRow[];
    });
    const openByEmail = new Map(openInvites.map((i) => [i.email, i]));
    const ctx = req.sendInvites ? await loadInviteContext(admin, churchId, session.id) : null;
    const expires = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();

    for (const [n, r] of candidates.entries()) {
      const participantId = linked.get(r.line)?.id ?? null;
      const groups = inviteGroups.get(r.line) ?? [];
      const open = openByEmail.get(r.email as string);
      if (open && open.role !== 'participant') continue; // a staff invite stays as it is
      const base = {
        first_name: r.first_name,
        last_name: r.last_name === '-' ? null : r.last_name,
        phone: r.phone,
        campus_id: campusId,
        participant_id: participantId,
        group_ids: Array.from(new Set([...(open?.group_ids ?? []), ...groups])),
      };
      const sending = req.sendInvites
        ? { nonce: newInviteNonce(), expires_at: expires, send_count: (open?.send_count ?? 0) + 1, invited_by: session.id }
        : {};
      const { data, error } = open
        ? await admin.from('church_invites').update({ ...base, ...sending }).eq('id', open.id).select('*').single()
        : await admin
            .from('church_invites')
            .insert({
              ...base,
              church_id: churchId,
              email: r.email,
              role: 'participant',
              nonce: newInviteNonce(),
              invited_by: session.id,
              expires_at: expires,
              send_count: 0,
              ...sending,
            })
            .select('*')
            .single();
      if (error || !data) {
        report.skipped.push({ line: r.line, reason: `Saved, but the invite failed: ${error?.message ?? 'unknown'}` });
        continue;
      }
      report.invitesPrepared += 1;
      if (req.sendInvites && ctx) {
        const scheduledFor = new Date(Date.now() + Math.floor(n / INVITES_PER_RUN) * RUN_MS).toISOString();
        const d = await deliverInvite(admin, data as InviteRow, { immediate: false, ctx, scheduledFor });
        if (d.ok) report.invitesQueued += 1;
      }
    }
  }

  await recordAudit({
    action: 'people.imported',
    entity_type: 'church',
    entity_id: churchId,
    metadata: {
      kind: req.kind,
      created: report.created,
      updated: report.updated,
      invites_prepared: report.invitesPrepared,
      invites_queued: report.invitesQueued,
      groups_created: report.groupsCreated,
      skipped: report.skipped.length,
    },
  });
  revalidatePath('/people');
  revalidatePath('/participants');
  revalidatePath('/dashboard');
  return { ...report, ok: true };
}

/** Send every invite the import prepared but did not send. */
export async function sendPreparedInvites(): Promise<{ ok: boolean; queued: number; error?: string }> {
  const session = await requireCampusAdmin();
  const churchId = session.profile?.church_id;
  if (!churchId) return { ok: false, queued: 0, error: 'No church context.' };
  const admin = await createServiceRoleClient();
  const { data } = await admin
    .from('church_invites')
    .select('*')
    .eq('church_id', churchId)
    .eq('role', 'participant')
    .eq('send_count', 0)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .limit(MAX_ROWS);
  const prepared = (data ?? []) as InviteRow[];
  const ctx = await loadInviteContext(admin, churchId, session.id);
  if (!ctx) return { ok: false, queued: 0, error: 'Church not found.' };
  let queued = 0;
  for (const [n, inv] of prepared.entries()) {
    const { data: fresh } = await admin
      .from('church_invites')
      .update({
        nonce: newInviteNonce(),
        expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
        send_count: 1,
        invited_by: session.id,
      })
      .eq('id', inv.id)
      .eq('send_count', 0)
      .select('*')
      .single();
    if (!fresh) continue;
    const scheduledFor = new Date(Date.now() + Math.floor(n / INVITES_PER_RUN) * RUN_MS).toISOString();
    const d = await deliverInvite(admin, fresh as InviteRow, { immediate: false, ctx, scheduledFor });
    if (d.ok) queued += 1;
  }
  await recordAudit({ action: 'invite.bulk_sent', entity_type: 'church', entity_id: churchId, metadata: { queued } });
  revalidatePath('/people');
  return { ok: true, queued };
}
