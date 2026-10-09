import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { connectName, PLATFORM_NAME } from '@/lib/brand';
import { loadTemplate, render } from '@/lib/notifications/enqueue';
import { brandedFrom, sendEmail } from '@/lib/notifications/senders/resend';
import { formatDateInZone, isValidTimeZone } from '@/lib/time/zoned';
import { INVITE_LINK_PLACEHOLDER, inviteLink } from './token';
import { rolePhrase, type InviteRow } from './types';

export interface DeliveryResult {
  ok: boolean;
  /** Sent now, or queued for the next drain (bulk sends, or a busy provider). */
  sent: boolean;
  error?: string;
}

/**
 * Sends an invite email under the church's own name. The outbox row keeps a
 * placeholder where the link goes, never the link, so the record is safe
 * for the admins who can read it. With `immediate`, the email goes out now
 * and a busy provider falls back to the queue; without it (bulk), the
 * drain sends it within a few minutes.
 */
export interface InviteContext {
  connectName: string;
  churchName: string;
  timeZone: string;
  inviterLine: string;
  subject: string;
  body: string;
}

/** What every invite from one church and one inviter shares. Load once for a bulk send. */
export async function loadInviteContext(
  admin: SupabaseClient,
  churchId: string,
  invitedBy: string | null,
  fromPlatform = false,
): Promise<InviteContext | null> {
  const [{ data: church }, { data: inviter }, template] = await Promise.all([
    admin.from('churches').select('name, connect_name, timezone').eq('id', churchId).maybeSingle(),
    invitedBy
      ? admin.from('profiles').select('first_name, last_name').eq('id', invitedBy).maybeSingle()
      : Promise.resolve({ data: null }),
    loadTemplate(admin, churchId, 'church_invite'),
  ]);
  const c = church as { name: string; connect_name: string | null; timezone: string | null } | null;
  if (!c || !template) return null;
  const name = connectName(c);
  const who = inviter as { first_name: string | null; last_name: string | null } | null;
  const inviterName = who ? `${who.first_name ?? ''} ${who.last_name ?? ''}`.trim() : '';
  return {
    connectName: name,
    churchName: c.name,
    timeZone: c.timezone && isValidTimeZone(c.timezone) ? c.timezone : 'America/Chicago',
    inviterLine: fromPlatform
      ? `${inviterName || 'The team'} at ${PLATFORM_NAME}`
      : inviterName
        ? `${inviterName} from ${c.name}`
        : c.name,
    subject: template.subject ?? `You're invited to ${name}`,
    body: template.body,
  };
}

export async function deliverInvite(
  admin: SupabaseClient,
  invite: Pick<InviteRow, 'id' | 'church_id' | 'email' | 'first_name' | 'last_name' | 'role' | 'nonce' | 'expires_at' | 'invited_by'>,
  opts: {
    immediate: boolean;
    fromPlatform?: boolean;
    ctx?: InviteContext;
    /** Bulk sends are spread out so they never hold up other messages. */
    scheduledFor?: string;
  },
): Promise<DeliveryResult> {
  const ctx = opts.ctx ?? (await loadInviteContext(admin, invite.church_id, invite.invited_by, opts.fromPlatform));
  if (!ctx) return { ok: false, sent: false, error: 'Church not found.' };
  const name = ctx.connectName;

  const vars = {
    first_name: invite.first_name || 'there',
    inviter: ctx.inviterLine,
    church_name: ctx.churchName,
    role_phrase: rolePhrase(invite.role),
    expires_on: formatDateInZone(invite.expires_at, ctx.timeZone, { weekday: 'long', month: 'long', day: 'numeric' }),
    invite_link: INVITE_LINK_PLACEHOLDER,
  };
  const subject = render(ctx.subject, vars);
  let body = render(ctx.body, vars);
  if (!body.includes(INVITE_LINK_PLACEHOLDER)) body = `${body}\n\nAccept your invite: ${INVITE_LINK_PLACEHOLDER}`;

  let sent = false;
  let providerId: string | undefined;
  let error: string | undefined;
  if (opts.immediate) {
    const result = await sendEmail({
      to: invite.email,
      subject,
      text: body.split(INVITE_LINK_PLACEHOLDER).join(inviteLink(invite.id, invite.nonce)),
      from: brandedFrom(name),
    });
    sent = result.ok;
    providerId = result.providerId;
    if (!result.ok && !result.retryable) error = result.error ?? 'The email could not be sent.';
  }

  const now = new Date().toISOString();
  const { error: outboxErr } = await admin.from('notification_outbox').insert({
    church_id: invite.church_id,
    template_key: 'church_invite',
    channel: 'email',
    recipient_email: invite.email,
    recipient_name: [invite.first_name, invite.last_name].filter(Boolean).join(' ') || null,
    subject,
    body,
    status: sent ? 'sent' : error ? 'failed' : 'pending',
    sent_at: sent ? now : null,
    ...(opts.scheduledFor && !sent ? { scheduled_for: opts.scheduledFor } : {}),
    error: error ?? null,
    metadata: { invite_id: invite.id, invite_nonce: invite.nonce, ...(providerId ? { provider_id: providerId } : {}) },
    idempotency_key: `invite:${invite.id}:${invite.nonce}`,
  });
  if (outboxErr && !sent) return { ok: false, sent: false, error: outboxErr.message };

  if (error) return { ok: false, sent: false, error };

  await admin
    .from('church_invites')
    .update({ last_sent_at: now })
    .eq('id', invite.id);
  return { ok: true, sent };
}
