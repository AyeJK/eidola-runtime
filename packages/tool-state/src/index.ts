// `workspace-registry.ts` is Node-only (fs/os/path) and intentionally NOT
// re-exported from this barrel — `@eidola/shrine`'s Vite renderer bundle
// imports `resolveVisualState` from this package for the browser, and a
// Node-builtin import anywhere in this barrel breaks that Rollup build.
// Node consumers (`@eidola/mcp`, `@eidola/claude-hooks`) import the
// workspace registry via the `@eidola/tool-state/workspace-registry`
// subpath export instead (see package.json `exports`).

export const LEGACY_VESSEL_STATE_ALIASES: Record<string, string> = {
  completed: 'success',
  confused: 'error',
  alerting: 'attention',
};

/** Map legacy vessel state names to canonical keys. */
export function normalizeVesselState(state: string): string {
  return LEGACY_VESSEL_STATE_ALIASES[state] ?? state;
}

/** Remap legacy expression keys to canonical; prefer canonical when both exist. */
export function normalizeExpressionKeys(
  expressions: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const legacyPending: Array<[string, string]> = [];

  for (const [key, clip] of Object.entries(expressions)) {
    const canonical = normalizeVesselState(key);
    if (key === canonical) {
      result[canonical] = clip;
    } else {
      legacyPending.push([canonical, clip]);
    }
  }

  for (const [canonical, clip] of legacyPending) {
    if (!(canonical in result)) {
      result[canonical] = clip;
    }
  }

  return result;
}

export const TOOL_AWARE_STATES = ['searching', 'writing', 'working'] as const;

/** Semantic states that collapse to visual `working` after the first tool hook in a turn. */
export const WORKING_CLUSTER = ['thinking', 'searching', 'writing', 'working'] as const;

export type WorkingClusterState = (typeof WORKING_CLUSTER)[number];

export function isWorkingClusterState(state: string): state is WorkingClusterState {
  return (WORKING_CLUSTER as readonly string[]).includes(state);
}

export interface ResolveVisualStateInput {
  state: string;
  firstToolStarted: boolean;
}

/** Map semantic vessel state + turn lock to a visual tier for renderer/clip playback. */
export function resolveVisualState({ state, firstToolStarted }: ResolveVisualStateInput): string {
  if (isWorkingClusterState(state)) {
    if (state === 'thinking') {
      return 'thinking';
    }
    return 'working';
  }
  return state;
}

export type ToolAwareState = (typeof TOOL_AWARE_STATES)[number];

const SEARCH_TOOLS = new Set([
  'Grep',
  'Glob',
  'Read',
  'SemanticSearch',
  'TabRead',
]);

const WRITE_TOOLS = new Set([
  'Write',
  'StrReplace',
  'EditNotebook',
  'Delete',
  'TabWrite',
]);

const WORKING_TOOLS = new Set(['Shell', 'Task', 'CallMcpTool']);

const TOOL_AWARE_HOOKS = new Set([
  'preToolUse',
  'beforeShellExecution',
  'beforeMCPExecution',
]);

const WORKING_HOOK_DEFAULT: ToolAwareState = 'working';

const SEARCH_SUBAGENT_TYPES = new Set(['explore', 'generalPurpose']);

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function isSkillPath(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized.endsWith('/SKILL.md') ||
    normalized.endsWith('SKILL.md') ||
    normalized.includes('/.cursor/skills/') ||
    normalized.includes('/skills-cursor/')
  );
}

export function extractReadPath(toolInput: unknown): string | undefined {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    return undefined;
  }

  const input = toolInput as Record<string, unknown>;
  if (typeof input.path === 'string' && input.path.length > 0) {
    return input.path;
  }

  if (typeof input.file_path === 'string' && input.file_path.length > 0) {
    return input.file_path;
  }

  return undefined;
}

export function extractSubagentType(toolInput: unknown): string | undefined {
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    return undefined;
  }

  const input = toolInput as Record<string, unknown>;
  if (typeof input.subagent_type === 'string' && input.subagent_type.length > 0) {
    return input.subagent_type;
  }

  return undefined;
}

function isMcpToolName(toolName: string): boolean {
  return toolName.startsWith('mcp__') || toolName.startsWith('mcp_');
}

function resolveTaskState(toolInput?: unknown): ToolAwareState {
  const subagentType = extractSubagentType(toolInput);
  if (subagentType && SEARCH_SUBAGENT_TYPES.has(subagentType)) {
    return 'searching';
  }

  if (subagentType === 'shell') {
    return 'working';
  }

  return 'working';
}

export function resolveStateFromTool(
  toolName: string | undefined,
  hookName: string,
  toolInput?: unknown,
): ToolAwareState {
  if (toolName === 'Task') {
    return resolveTaskState(toolInput);
  }

  if (toolName) {
    if (SEARCH_TOOLS.has(toolName)) {
      return 'searching';
    }

    if (WRITE_TOOLS.has(toolName)) {
      return 'writing';
    }

    if (WORKING_TOOLS.has(toolName) || isMcpToolName(toolName)) {
      return 'working';
    }
  }

  if (TOOL_AWARE_HOOKS.has(hookName)) {
    return WORKING_HOOK_DEFAULT;
  }

  return WORKING_HOOK_DEFAULT;
}

export function refineGenericWorkingState(
  state: string,
  tool: string | undefined,
  toolInput?: unknown,
): string {
  if (state !== 'working' || !tool) {
    return state;
  }

  return resolveStateFromTool(tool, 'preToolUse', toolInput);
}
