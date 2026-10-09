import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { twilioSignature, twilioSignatureValid } from '../../lib/notifications/twilio-signature.ts';

const url = 'https://example.test/api/twilio/inbound';
const token = 'auth-token';

test('signs the URL plus the fields sorted by name', () => {
  const params = new URLSearchParams({ To: '+14325550000', From: '+14325550101', Body: 'STOP' });
  const manual = createHmac('sha1', token)
    .update(`${url}BodySTOPFrom+14325550101To+14325550000`)
    .digest('base64');
  assert.equal(twilioSignature(url, params, token), manual);
  assert.ok(twilioSignatureValid(url, params, manual, token));
});

test('a changed field, URL, token or missing header fails', () => {
  const params = new URLSearchParams({ From: '+14325550101', Body: 'STOP' });
  const sig = twilioSignature(url, params, token);
  assert.equal(twilioSignatureValid(url, new URLSearchParams({ From: '+14325550102', Body: 'STOP' }), sig, token), false);
  assert.equal(twilioSignatureValid(`${url}?x=1`, params, sig, token), false);
  assert.equal(twilioSignatureValid(url, params, sig, 'other-token'), false);
  assert.equal(twilioSignatureValid(url, params, null, token), false);
});
