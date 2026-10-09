import 'server-only';

import { createHash } from 'node:crypto';

/**
 * What the audit log keeps of a deleted account's email: enough to notice
 * the same person coming back, never the address itself.
 */
export function emailHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}
