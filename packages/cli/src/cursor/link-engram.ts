import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadEngramFromDirectory } from '../engram/loader.js';
import { resolveEngramLocation } from '../engram/registry.js';
import { EngramLoadError } from '../engram/types.js';
import {
  compileSoulToCursorRule,
  parseCompiledCursorRule,
  setCursorRuleAlwaysApply,
} from './compile.js';
import { computeSoulHash } from './hash.js';
import { warnIfStaleSoulCompile } from './stale.js';
import {
  buildWorkspaceConfig,
  cursorRulePath,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  workspaceConfigPath,
} from './workspace-config.js';

export interface LinkEngramResult {
  ok: true;
  engramId: string;
  mdcPath: string;
  workspaceConfigPath: string;
  engramDirectory: string;
  previousEngramId?: string;
  deactivatedPrevious: boolean;
}

export interface LinkEngramParams {
  workspaceRoot: string;
  engramId: string;
  engramsDir: string;
  engramDirectory?: string;
  vesselsDir?: string;
  previousEngramId?: string;
}

async function readPrebuiltCursorRule(
  engramDirectory: string,
  engramId: string,
): Promise<string | null> {
  const bundleRoot = dirname(engramDirectory);
  const candidates = [
    join(bundleRoot, '.cursor', 'rules', `${engramId}.mdc`),
    join(engramDirectory, '.cursor', 'rules', `${engramId}.mdc`),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return await readFile(candidate, 'utf8');
    } catch {
      // Try next candidate.
    }
  }

  const rulesDir = join(bundleRoot, '.cursor', 'rules');
  try {
    const files = await readdir(rulesDir);
    const match = files.find((file) => file.endsWith('.mdc'));
    if (match) {
      return await readFile(join(rulesDir, match), 'utf8');
    }
  } catch {
    return null;
  }

  return null;
}

export async function linkEngramToWorkspace(params: LinkEngramParams): Promise<LinkEngramResult> {
  const workspaceRoot = resolve(params.workspaceRoot);
  const engramId = params.engramId.trim();
  const engramsDir = resolve(params.engramsDir);

  if (!engramId) {
    throw new EngramLoadError('Engram id is required.', 'INVALID_ENGRAM_ID');
  }

  let engramDirectory = params.engramDirectory?.trim();
  if (!engramDirectory) {
    try {
      const located = await resolveEngramLocation(engramsDir, engramId);
      engramDirectory = located.directory;
    } catch (error) {
      if (error instanceof EngramLoadError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new EngramLoadError(message, 'MISSING_ENGRAM');
    }
  }

  const loaded = await loadEngramFromDirectory(engramDirectory);
  const priorConfig = await readWorkspaceConfig(workspaceRoot);
  const previousEngramId =
    params.previousEngramId?.trim() || priorConfig?.active_engram_id?.trim() || undefined;

  let deactivatedPrevious = false;
  if (previousEngramId && previousEngramId !== engramId) {
    const previousMdcPath = cursorRulePath(workspaceRoot, previousEngramId);
    try {
      const previousContent = await readFile(previousMdcPath, 'utf8');
      await writeFile(
        previousMdcPath,
        setCursorRuleAlwaysApply(previousContent, false),
        'utf8',
      );
      deactivatedPrevious = true;
    } catch {
      // Previous rule may not exist — non-fatal.
    }
  }

  const prebuilt = await readPrebuiltCursorRule(engramDirectory, engramId);
  const prebuiltMatchesSoul =
    prebuilt &&
    computeSoulHash(parseCompiledCursorRule(prebuilt).body) === computeSoulHash(loaded.soul);
  const compiled = prebuiltMatchesSoul
    ? (() => {
        const content = setCursorRuleAlwaysApply(prebuilt, true);
        const { body } = parseCompiledCursorRule(content);
        return { content, soulHash: computeSoulHash(body) };
      })()
    : compileSoulToCursorRule(loaded);

  const mdcPath = cursorRulePath(workspaceRoot, engramId);
  await mkdir(resolve(workspaceRoot, '.cursor', 'rules'), { recursive: true });
  await writeFile(mdcPath, compiled.content, 'utf8');

  const workspaceConfig = buildWorkspaceConfig({
    engramId,
    soulHash: compiled.soulHash,
    engramsDir,
  });
  await writeWorkspaceConfig(workspaceRoot, workspaceConfig);

  await warnIfStaleSoulCompile({
    engramDirectory,
    mdcPath,
    workspaceConfig,
  });

  return {
    ok: true,
    engramId,
    mdcPath,
    workspaceConfigPath: workspaceConfigPath(workspaceRoot),
    engramDirectory,
    previousEngramId,
    deactivatedPrevious,
  };
}
