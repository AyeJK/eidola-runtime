/** Human-readable HUD labels for tool ids on `ShrineStatePayload.broadcast.tool`. */
const TOOL_LABELS: Record<string, string> = {
  Grep: 'grepping',
  Glob: 'globbing',
  Read: 'reading',
  SemanticSearch: 'searching',
  TabRead: 'reading',
  Write: 'writing',
  StrReplace: 'editing',
  Edit: 'editing',
  EditNotebook: 'editing',
  NotebookEdit: 'editing',
  MultiEdit: 'editing',
  Delete: 'deleting',
  TabWrite: 'writing',
  Bash: 'bashing',
  Shell: 'running shell',
  Task: 'delegating',
  Agent: 'delegating',
  Skill: 'running skill',
  WebFetch: 'fetching',
  WebSearch: 'searching',
  TodoWrite: 'planning',
  AskUserQuestion: 'asking',
  ScheduleWakeup: 'scheduling',
  ToolSearch: 'searching',
  CallMcpTool: 'calling tool',
};

/** Naive present-participle fallback for unmapped tool ids (e.g. `Foo` -> `fooing`, `Compile` -> `compiling`). */
function gerundize(tool: string): string {
  const lower = tool.toLowerCase();
  if (lower.endsWith('e') && !lower.endsWith('ee')) {
    return `${lower.slice(0, -1)}ing`;
  }
  return `${lower}ing`;
}

/** Map a raw tool id (e.g. `Grep`, `mcp__claude_ai_Supabase__list_tables`) to a HUD label. */
export function toolHudLabel(tool: string): string {
  const direct = TOOL_LABELS[tool];
  if (direct) {
    return direct;
  }

  if (tool.startsWith('mcp__') || tool.startsWith('mcp_')) {
    return 'calling tool';
  }

  return gerundize(tool);
}
