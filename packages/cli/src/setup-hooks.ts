import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CursorHooksTemplate {
  version?: number;
  hooks: Record<string, Array<{ command: string; [key: string]: unknown }>>;
}

export interface SetupCursorHooksOptions {
  /** When true, write to ~/.cursor/hooks.json. Default false (workspace-scoped). */
  global?: boolean;
  /** Project workspace root when global is false. */
  workspaceRoot?: string;
  /** Override relay.js path (for tests). */
  relayPath?: string;
  /** Override template path (for tests). */
  templatePath?: string;
}

export interface SetupCursorHooksResult {
  hooksPath: string;
  relayPath: string;
}

export function resolveCliPackageRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

export function defaultRelayPath(): string {
  return join(resolveCliPackageRoot(), 'cursor-hooks', 'relay.js');
}

export function defaultHooksTemplatePath(): string {
  return join(resolveCliPackageRoot(), 'cursor-hooks', 'templates', 'hooks.json');
}

export function isEidolaRelayCommand(command: unknown): boolean {
  if (typeof command !== 'string') {
    return false;
  }
  const normalized = command.replace(/\\/g, '/');
  return (
    normalized.includes('cursor-hooks/relay') ||
    normalized.includes('eidola-cursor-relay') ||
    normalized.includes('/packages/cursor-hooks/dist/relay')
  );
}

export function mergeCursorHooksConfig(
  existing: CursorHooksTemplate | null,
  template: CursorHooksTemplate,
  relayCommand: (hookName: string) => string,
): CursorHooksTemplate {
  const mergedHooks: CursorHooksTemplate['hooks'] = { ...(existing?.hooks ?? {}) };

  for (const [hookName, entries] of Object.entries(template.hooks)) {
    const prior = (mergedHooks[hookName] ?? []).filter(
      (entry) => !isEidolaRelayCommand(entry.command),
    );
    mergedHooks[hookName] = [
      ...prior,
      ...entries.map((entry) => ({
        ...entry,
        command: relayCommand(hookName),
      })),
    ];
  }

  return {
    version: template.version ?? existing?.version ?? 1,
    hooks: mergedHooks,
  };
}

export async function setupCursorHooks(
  options: SetupCursorHooksOptions = {},
): Promise<SetupCursorHooksResult> {
  const global = options.global === true;
  const workspaceRoot = options.workspaceRoot
    ? resolve(options.workspaceRoot)
    : resolve(process.cwd());
  const targetDir = global
    ? join(homedir(), '.cursor')
    : join(workspaceRoot, '.cursor');
  const hooksPath = join(targetDir, 'hooks.json');
  const relayPath = (options.relayPath ?? defaultRelayPath()).replace(/\\/g, '/');
  const templatePath = options.templatePath ?? defaultHooksTemplatePath();

  await access(relayPath).catch(() => {
    throw new Error(`Eidola hook relay not found at ${relayPath}. Reinstall @eidola/cli.`);
  });

  const templateRaw = await readFile(templatePath, 'utf8');
  const template = JSON.parse(templateRaw) as CursorHooksTemplate;

  let existing: CursorHooksTemplate | null = null;
  try {
    existing = JSON.parse(await readFile(hooksPath, 'utf8')) as CursorHooksTemplate;
  } catch {
    existing = null;
  }

  const relayCommand = (hookName: string) => `node "${relayPath}" ${hookName}`;
  const config = mergeCursorHooksConfig(existing, template, relayCommand);

  await mkdir(targetDir, { recursive: true });
  await writeFile(hooksPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return { hooksPath, relayPath };
}
