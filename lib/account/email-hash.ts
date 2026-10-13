import 'server-only';

import { createHash } from 'node:crypto';

/**
 * What the audit log keeps of a deleted account's email: enough to notice
 * the same person coming back, never the address itself.
 */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * The same for a phone number. Hashes the last ten digits, the way the
 * texting opt-out matches numbers, so "(432) 555-1234" and "+14325551234"
 * are one person. Null when there aren't ten digits.
 */
export function phoneHash(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? createHash('sha256').update(digits).digest('hex') : null;
}
