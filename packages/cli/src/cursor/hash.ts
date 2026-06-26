import { createHash } from 'node:crypto';

/** SHA-256 hex digest of normalized Soul prose (LF line endings). */
export function computeSoulHash(soul: string): string {
  const normalized = soul.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
