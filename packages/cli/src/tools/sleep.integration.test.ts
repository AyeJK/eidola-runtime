import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { claudeMdPath, hasClaudeMdSoulImport } from '../claude/claude-md.js';
import { claudeSoulPath } from '../claude/copy-soul.js';
import { cursorRulePath, readWorkspaceConfig } from '../cursor/workspace-config.js';
import { createFixtureEngramsDir, FIXTURE_ENGRAM_ID } from '../integration/local-engram-fixture.js';
import { SessionState } from '../session/state.js';
import { createToolHandlers } from './handlers.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('sleep integration', () => {
  let tempWorkspace: string | null = null;
  let tempEngramsDir: string | null = null;

  afterEach(async () => {
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
    if (tempEngramsDir) {
      await rm(tempEngramsDir, { recursive: true, force: true });
      tempEngramsDir = null;
    }
  });

  it('cursor client sleep deactivates the .mdc and clears config, leaves Claude Code artifacts untouched', async () => {
    tempWorkspace = await tempDir('eidola-sleep-cursor-');
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'cursor', version: '1.0.0' });
    const result = await handlers.sleep({ name: 'cursor', version: '1.0.0' });

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('cursor');
    expect(result.cursor_deactivated).toBe(true);
    expect(result.claude_md_removed).toBe(false);

    const mdc = await readFile(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID), 'utf8');
    expect(mdc).toContain('alwaysApply: false');
    await expect(readWorkspaceConfig(tempWorkspace)).resolves.toBeNull();
    await expect(pathExists(claudeMdPath(tempWorkspace))).resolves.toBe(false);
  });

  it('claude_code client sleep removes marker block + soul file, leaves .mdc untouched', async () => {
    tempWorkspace = await tempDir('eidola-sleep-claude-');
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'claude-code', version: '1.0.0' });
    const result = await handlers.sleep({ name: 'claude-code', version: '1.0.0' });

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('claude_code');
    expect(result.cursor_deactivated).toBe(false);
    expect(result.claude_md_removed).toBe(true);

    await expect(hasClaudeMdSoulImport(tempWorkspace)).resolves.toBe(false);
    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(false);
    await expect(pathExists(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(false);
  });

  it('unknown/missing clientInfo sleeps both platforms artifacts', async () => {
    tempWorkspace = await tempDir('eidola-sleep-unknown-');
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID);
    const result = await handlers.sleep();

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('unknown');
    expect(result.cursor_deactivated).toBe(true);
    expect(result.claude_md_removed).toBe(true);

    const mdc = await readFile(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID), 'utf8');
    expect(mdc).toContain('alwaysApply: false');
    await expect(hasClaudeMdSoulImport(tempWorkspace)).resolves.toBe(false);
    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(false);
  });

  it('returns a clear error, not silent ok:true, when nothing is active', async () => {
    tempWorkspace = await tempDir('eidola-sleep-empty-');
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.sleep();

    expect(result.ok).toBe(false);
    expect(result.code).toBe('NO_ACTIVE_ENGRAM');
    expect(typeof result.error).toBe('string');
  });

  it('clears session active Engram after a successful sleep', async () => {
    tempWorkspace = await tempDir('eidola-sleep-session-');
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID);
    expect(session.getActive()).not.toBeNull();

    const result = await handlers.sleep();
    expect(result.ok).toBe(true);
    expect(session.getActive()).toBeNull();
  });
});
