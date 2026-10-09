import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { siteUrl } from '@/lib/site';

/**
 * Invite links are signed, not stored. The link carries the invite id and
 * an HMAC of the id and the invite's current nonce under a server-only
 * key. Neither church_invites nor the notification outbox (both readable by
 * a church's campus admins) ever holds a usable link, and a resend rotates
 * the nonce so every older link stops working.
 */

/** Left in an outbox body where the drain signs the link at send time. */
export const INVITE_LINK_PLACEHOLDER = '{{invite_link}}';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signingKey(): Buffer {
  const explicit = process.env.INVITE_SIGNING_SECRET?.trim();
  if (explicit && explicit.length >= 32) return Buffer.from(explicit, 'utf8');
  const root = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root) {
    throw new Error('Invites need INVITE_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY on the server.');
  }
  // A key derived for this one purpose, so the service key itself is never
  // the HMAC key.
  return createHmac('sha256', root).update('churchconnect:invite-link:v1').digest();
}

export function newInviteNonce(): string {
  return randomBytes(18).toString('base64url');
}

function sign(inviteId: string, nonce: string): string {
  return createHmac('sha256', signingKey()).update(`${inviteId}.${nonce}`).digest('base64url');
}

/** The path segment for /invite/[code]. */
export function inviteCode(inviteId: string, nonce: string): string {
  return `${inviteId}.${sign(inviteId, nonce)}`;
}

export function inviteLink(inviteId: string, nonce: string): string {
  return `${siteUrl()}/invite/${inviteCode(inviteId, nonce)}`;
}

export function parseInviteCode(code: string): { inviteId: string; token: string } | null {
  const raw = decodeURIComponent(code ?? '');
  const dot = raw.indexOf('.');
  if (dot <= 0) return null;
  const inviteId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!UUID.test(inviteId) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return { inviteId, token };
}

/** Constant-time check of a link's token against the invite's current nonce. */
export function inviteTokenMatches(inviteId: string, nonce: string, token: string): boolean {
  const expected = Buffer.from(sign(inviteId, nonce));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
