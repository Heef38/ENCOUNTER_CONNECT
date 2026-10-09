import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Twilio's request signature: HMAC-SHA1, under the account's auth token,
 * of the exact webhook URL followed by every form field's name and value,
 * sorted by name, base64-encoded.
 */
export function twilioSignature(url: string, params: URLSearchParams, authToken: string): string {
  const keys = Array.from(new Set(params.keys())).sort();
  const data = keys.reduce((acc, k) => acc + k + params.getAll(k).join(''), url);
  return createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

export function twilioSignatureValid(url: string, params: URLSearchParams, signature: string | null, authToken: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(url, params, authToken));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
