export type DetectedClient = 'cursor' | 'claude_code' | 'unknown';

export interface ClientInfoLike {
  name?: string;
  version?: string;
}

/**
 * Known `clientInfo.name` values reported by MCP clients during the
 * `initialize` handshake. No live handshake log exists in this repo yet
 * (see Sprint 5.1.1 spike notes) — these are the most defensible values
 * found in SDK types/docs as of this writing:
 *   - Cursor's MCP client reports "cursor" (also seen as "Cursor" in
 *     some IDE builds/extensions).
 *   - Claude Code's MCP client reports "claude-code" (also seen written
 *     as "Claude Code").
 * Matching is case-insensitive against this list to absorb either casing.
 * If empirical logging later reveals different literal strings, update
 * these arrays — `detectClient` itself does not need to change.
 */
const CURSOR_CLIENT_NAMES = ['cursor'];
const CLAUDE_CODE_CLIENT_NAMES = ['claude-code', 'claude code'];

export function detectClient(clientInfo: ClientInfoLike | undefined): DetectedClient {
  const name = clientInfo?.name?.trim().toLowerCase();
  if (!name) {
    return 'unknown';
  }

  if (CURSOR_CLIENT_NAMES.some((candidate) => name === candidate || name.includes(candidate))) {
    return 'cursor';
  }

  if (
    CLAUDE_CODE_CLIENT_NAMES.some((candidate) => name === candidate || name.includes(candidate))
  ) {
    return 'claude_code';
  }

  return 'unknown';
}
