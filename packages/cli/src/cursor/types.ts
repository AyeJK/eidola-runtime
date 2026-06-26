export interface EidolaWorkspaceConfig {
  /** Active Engram slug — matches directory name and compiled rule filename. */
  active_engram_id: string;
  /** Optional override for Engram directory root. Defaults to `{EIDOLA_ROOT}/engrams`. */
  engrams_dir?: string;
  /** SHA-256 hex of SOUL.md at last compile — used for stale-rule detection. */
  soul_hash: string;
  /** ISO-8601 timestamp when the Cursor rule was last compiled. */
  compiled_at: string;
  /** Shrine display surface: `browser` or `kraken-elite-v2`. */
  shrine_surface?: string;
}

export interface CompiledCursorRule {
  engramId: string;
  name: string;
  soulHash: string;
  /** Full `.mdc` file content including frontmatter. */
  content: string;
}
