import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ClaudeHookEntry {
  type: string;
  command: string;
  [key: string]: unknown;
}

export interface ClaudeHookMatcher {
  matcher?: string;
  hooks: ClaudeHookEntry[];
  [key: string]: unknown;
}

export type ClaudeHooksTemplate = Record<string, ClaudeHookMatcher[]>;

export interface ClaudeSettings {
  hooks?: ClaudeHooksTemplate;
  [key: string]: unknown;
}

export interface SetupClaudeHooksOptions {
  /** When true, write to ~/.claude/settings.json. Default true. */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
  /** Override relay.js path (for tests). */
  relayPath?: string;
  /** Override template path (for tests). */
  templatePath?: string;
}

export interface SetupClaudeHooksResult {
  settingsPath: string;
  relayPath: string;
}

export function resolveCliPackageRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function defaultClaudeRelayPath(): string {
  return join(resolveCliPackageRoot(), 'claude-hooks', 'relay.js');
}

export function defaultClaudeHooksTemplatePath(): string {
  return join(resolveCliPackageRoot(), 'claude-hooks', 'templates', 'hooks.json');
}

function isEidolaRelayCommand(command: unknown, hookName?: string): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  const normalized = command.replace(/\\/g, '/');
  if (
    normalized.includes('claude-hooks/relay') ||
    normalized.includes('eidola-claude-relay') ||
    normalized.includes('/packages/claude-hooks/dist/relay')
  ) {
    return true;
  }
  if (!hookName) {
    return false;
  }
  // Structural match scoped to this specific hook name: `node "<path>" <hookName>`.
  // This covers relay paths that don't match the known substrings above (e.g.
  // relocated installs or test fixtures), so re-running the merge with a
  // different/relocated relay path still replaces the prior Eidola entry in
  // place instead of appending a duplicate. Scoping to the exact hookName
  // (rather than matching any trailing token) keeps this from misidentifying
  // unrelated user-authored `node "script.js" <arg>` hooks as Eidola's.
  const escapedHookName = hookName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^node\\s+"[^"]*"\\s+${escapedHookName}$`).test(normalized);
}

export function mergeClaudeHooksConfig(
  existing: ClaudeSettings | null,
  template: ClaudeHooksTemplate,
  relayCommand: (hookName: string) => string,
): ClaudeSettings {
  const existingHooks = existing?.hooks ?? {};
  const mergedHooks: ClaudeHooksTemplate = { ...existingHooks };

  for (const [hookName, matchers] of Object.entries(template)) {
    const priorMatchers = (mergedHooks[hookName] ?? []).filter(
      (matcher) => !matcher.hooks?.some((entry) => isEidolaRelayCommand(entry.command, hookName)),
    );

    const newMatchers = matchers.map((matcher) => ({
      ...matcher,
      hooks: matcher.hooks.map((entry) => ({
        ...entry,
        command: relayCommand(hookName),
      })),
    }));

    mergedHooks[hookName] = [...priorMatchers, ...newMatchers];
  }

  return {
    ...(existing ?? {}),
    hooks: mergedHooks,
  };
}

export async function setupClaudeHooks(
  options: SetupClaudeHooksOptions = {},
): Promise<SetupClaudeHooksResult> {
  const global = options.global !== false;
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : resolve(process.cwd());
  const targetDir = global ? join(homedir(), '.claude') : join(workspaceRoot, '.claude');
  const settingsPath = join(targetDir, 'settings.json');
  const relayPath = (options.relayPath ?? defaultClaudeRelayPath()).replace(/\\/g, '/');
  const templatePath = options.templatePath ?? defaultClaudeHooksTemplatePath();

  await access(relayPath).catch(() => {
    throw new Error(`Eidola hook relay not found at ${relayPath}. Reinstall @eidola/cli.`);
  });

  const templateRaw = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateRaw) as ClaudeHooksTemplate;

  let existing: ClaudeSettings | null = null;
  try {
    existing = JSON.parse(await readFile(settingsPath, 'utf8')) as ClaudeSettings;
  } catch {
    existing = null;
  }

  const relayCommand = (hookName: string) => `node "${relayPath}" ${hookName}`;
  const config = mergeClaudeHooksConfig(existing, template, relayCommand);

  await mkdir(targetDir, { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return { settingsPath, relayPath };
}
