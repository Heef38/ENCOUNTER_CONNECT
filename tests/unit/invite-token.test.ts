import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.INVITE_SIGNING_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.NEXT_PUBLIC_SITE_URL = 'https://example.test';

const { inviteCode, inviteLink, inviteTokenMatches, newInviteNonce, parseInviteCode } = await import('../../lib/invites/token.ts');

const id = '3f6c9a2e-1b7d-4c8e-9a10-2b3c4d5e6f70';

test('a link round-trips and matches only its own nonce', () => {
  const nonce = newInviteNonce();
  const parsed = parseInviteCode(inviteCode(id, nonce));
  assert.ok(parsed);
  assert.equal(parsed.inviteId, id);
  assert.ok(inviteTokenMatches(id, nonce, parsed.token));
  assert.equal(inviteTokenMatches(id, newInviteNonce(), parsed.token), false, 'a resend kills the old link');
  assert.match(inviteLink(id, nonce), /^https:\/\/example\.test\/invite\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
});

test('a link for one invite does not open another', () => {
  const nonce = newInviteNonce();
  const parsed = parseInviteCode(inviteCode(id, nonce))!;
  assert.equal(inviteTokenMatches('00000000-0000-4000-8000-000000000000', nonce, parsed.token), false);
});

test('malformed and tampered links are refused', () => {
  const nonce = newInviteNonce();
  const code = inviteCode(id, nonce);
  assert.equal(parseInviteCode('not-a-code'), null);
  assert.equal(parseInviteCode(`${id}.short`), null);
  assert.equal(parseInviteCode(`nope.${code.split('.')[1]}`), null);
  const tampered = code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A');
  const p = parseInviteCode(tampered)!;
  assert.equal(inviteTokenMatches(id, nonce, p.token), false);
});

test('a different key signs differently', async () => {
  const nonce = newInviteNonce();
  const a = inviteCode(id, nonce);
  process.env.INVITE_SIGNING_SECRET = 'another-secret-that-is-at-least-32-characters';
  const b = inviteCode(id, nonce);
  assert.notEqual(a, b);
});
