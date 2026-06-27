import { access, mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import { claudeMdPath } from '../claude/claude-md.js';
import { claudeSoulPath } from '../claude/copy-soul.js';
import { compileSoulToCursorRule } from '../cursor/compile.js';
import { mcpAwakenSignalPath } from '../cursor/mcp-awaken-signal.js';
import { buildWorkspaceConfig, cursorRulePath, writeWorkspaceConfig } from '../cursor/workspace-config.js';
import { loadEngramFromDirectory } from '../engram/loader.js';
import {
  createFixtureEngramsDir,
  writeFixtureEngram,
  FIXTURE_ENGRAM_ID,
  FIXTURE_ENGRAM_NAME,
} from '../integration/local-engram-fixture.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import { isValidSoulInjectionPayload } from '../soul/injection.js';
import { createToolHandlers } from './handlers.js';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const repoRoot = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('awaken integration', () => {
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

  it('awakens fixture engram and returns valid Soul injection payload', async () => {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;
    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID);

    expect(result.ok).toBe(true);
    expect(result.engram_id).toBe(FIXTURE_ENGRAM_ID);
    expect(result.name).toBe(FIXTURE_ENGRAM_NAME);
    expect(result.soul_source).toBe('injection');
    expect(isValidSoulInjectionPayload(result.soul_injection)).toBe(true);

    const injection = result.soul_injection as {
      messages: Array<{ content: string }>;
    };

    const content = injection.messages[0]?.content ?? '';
    expect(content).toContain('<system-reminder>');
    expect(content).toContain('</system-reminder>');
    expect(content).toContain(FIXTURE_ENGRAM_NAME);
    expect(content).toContain('test fixture persona');
    expect(content).not.toContain('engram_version');
    expect(content).not.toContain('---');
  });

  it('returns structured error for missing Engram without throwing', async () => {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;
    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken('does-not-exist');

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MISSING_ENGRAM');
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('not found in Eidola folder');
  });

  it('broadcasts idle on successful awaken', async () => {
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;
    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
    });
    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    await stateSocket.start();
    const handlers = createToolHandlers(config, session, stateSocket);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID);

    expect(result.ok).toBe(true);
    expect(result.expression).toBe('idle.json');

    const buffer = stateSocket.getBuffer();
    expect(
      buffer.some(
        (entry) => entry.engram_id === FIXTURE_ENGRAM_ID && entry.state === 'idle',
      ),
    ).toBe(true);

    await stateSocket.close();
  });

  it('still returns soul_injection when a compiled Cursor rule already exists', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-rule-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;
    const loaded = await loadEngramFromDirectory(fixture.engramDir);
    const compiled = compileSoulToCursorRule(loaded);
    const rulesDir = join(tempWorkspace, '.cursor', 'rules');
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, `${FIXTURE_ENGRAM_ID}.mdc`), compiled.content, 'utf8');
    await writeWorkspaceConfig(
      tempWorkspace,
      buildWorkspaceConfig({
        engramId: FIXTURE_ENGRAM_ID,
        soulHash: compiled.soulHash,
        engramsDir: fixture.engramsDir,
      }),
    );

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'cursor', version: '1.0.0' });

    expect(result.ok).toBe(true);
    expect(result.soul_source).toBe('cursor_rule');
    expect(isValidSoulInjectionPayload(result.soul_injection)).toBe(true);
  });

  it('cursor client writes only the .mdc artifact, no Claude Code artifacts', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-client-cursor-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'cursor', version: '1.0.0' });

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('cursor');
    expect(result.cursor_linked).toBe(true);
    expect(result.claude_md_linked).toBe(false);
    expect(isValidSoulInjectionPayload(result.soul_injection)).toBe(true);

    await expect(pathExists(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(true);
    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(false);
    await expect(pathExists(claudeMdPath(tempWorkspace))).resolves.toBe(false);
  });

  it('claude_code client writes only .claude/souls + CLAUDE.md, no Cursor artifacts', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-client-claude-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID, {
      name: 'claude-code',
      version: '1.0.0',
    });

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('claude_code');
    expect(result.cursor_linked).toBe(false);
    expect(result.claude_md_linked).toBe(true);
    expect(isValidSoulInjectionPayload(result.soul_injection)).toBe(true);

    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(true);
    const claudeMd = await readFile(claudeMdPath(tempWorkspace), 'utf8');
    expect(claudeMd).toContain(`@.claude/souls/${FIXTURE_ENGRAM_ID}.md`);
    await expect(
      pathExists(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID)),
    ).resolves.toBe(false);
  });

  it('unknown/missing clientInfo falls back to writing both artifacts', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-client-unknown-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID);

    expect(result.ok).toBe(true);
    expect(result.detected_client).toBe('unknown');
    expect(result.cursor_linked).toBe(true);
    expect(result.claude_md_linked).toBe(true);
    expect(isValidSoulInjectionPayload(result.soul_injection)).toBe(true);

    await expect(pathExists(cursorRulePath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(true);
    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(true);
  });

  it('mid-session Engram switch on claude_code updates only the import path', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-switch-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const secondEngramId = `${FIXTURE_ENGRAM_ID}-second`;
    await writeFixtureEngram(fixture.engramsDir, secondEngramId);

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'claude-code', version: '1.0.0' });
    const claudeMdBefore = await readFile(claudeMdPath(tempWorkspace), 'utf8');
    const customNote = '\n\nShaper note: do not remove this line.\n';
    await writeFile(claudeMdPath(tempWorkspace), `${claudeMdBefore}${customNote}`, 'utf8');

    const result = await handlers.awaken(secondEngramId, { name: 'claude-code', version: '1.0.0' });
    expect(result.ok).toBe(true);

    const claudeMdAfter = await readFile(claudeMdPath(tempWorkspace), 'utf8');
    expect(claudeMdAfter).toContain(`@.claude/souls/${secondEngramId}.md`);
    expect(claudeMdAfter).not.toContain(`@.claude/souls/${FIXTURE_ENGRAM_ID}.md`);
    expect(claudeMdAfter).toContain('Shaper note: do not remove this line.');
  });

  it('switching Engrams on claude_code deletes the previous soul file, leaving only the new one', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-switch-cleanup-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;

    const secondEngramId = `${FIXTURE_ENGRAM_ID}-second`;
    await writeFixtureEngram(fixture.engramsDir, secondEngramId);

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    await handlers.awaken(FIXTURE_ENGRAM_ID, { name: 'claude-code', version: '1.0.0' });
    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(true);

    const result = await handlers.awaken(secondEngramId, { name: 'claude-code', version: '1.0.0' });
    expect(result.ok).toBe(true);

    await expect(pathExists(claudeSoulPath(tempWorkspace, FIXTURE_ENGRAM_ID))).resolves.toBe(false);
    await expect(pathExists(claudeSoulPath(tempWorkspace, secondEngramId))).resolves.toBe(true);
  });

  it('writes mcp-awaken.json with catalog paths when workspace is linked', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-awaken-signal-'));
    const fixture = await createFixtureEngramsDir();
    tempEngramsDir = fixture.engramsDir;
    await writeWorkspaceConfig(
      tempWorkspace,
      buildWorkspaceConfig({
        engramId: FIXTURE_ENGRAM_ID,
        soulHash: 'test',
        engramsDir: fixture.engramsDir,
      }),
    );

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ROOT: repoRoot,
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });
    const session = new SessionState();
    const handlers = createToolHandlers(config, session);

    const result = await handlers.awaken(FIXTURE_ENGRAM_ID);

    expect(result.ok).toBe(true);

    const signalRaw = await readFile(mcpAwakenSignalPath(), 'utf8');
    const signal = JSON.parse(signalRaw) as {
      engram_id: string;
      engram_directory: string;
      vessels_dir: string;
      engrams_dir: string;
      workspace_root: string;
    };

    expect(signal.engram_id).toBe(FIXTURE_ENGRAM_ID);
    expect(signal.engram_directory).toContain(FIXTURE_ENGRAM_ID);
    expect(signal.vessels_dir).toBeTruthy();
    expect(signal.engrams_dir).toBe(fixture.engramsDir);
    expect(signal.workspace_root).toBe(tempWorkspace);
  });
});
