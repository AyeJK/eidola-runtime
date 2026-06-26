import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveEidolaRuntimeConfig } from '../config.js';
import {
  mcpAwakenSignalPath,
  readMcpAwakenSignal,
  writeMcpAwakenSignal,
} from '../cursor/mcp-awaken-signal.js';
import { eidolaConfigDir } from '../workspace-registry.js';
import { hasPonytailReleaseBundle, requirePonytailReleaseBundle } from '../integration/release-bundle-fixture.js';
import { SessionState } from '../session/state.js';
import { createStateSocketServer } from '../socket/server.js';
import { watchMcpAwakenSignal } from './mcp-awaken.js';

async function backupSignalFile(): Promise<string | null> {
  try {
    return await readFile(mcpAwakenSignalPath(), 'utf8');
  } catch {
    return null;
  }
}

async function restoreSignalFile(prior: string | null): Promise<void> {
  const path = mcpAwakenSignalPath();
  if (prior === null) {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, prior, 'utf8');
}

describe('readMcpAwakenSignal validation', () => {
  let priorSignal: string | null = null;

  afterEach(async () => {
    await restoreSignalFile(priorSignal);
    priorSignal = null;
  });

  it('returns null when engram_directory is missing', async () => {
    priorSignal = await backupSignalFile();
    await mkdir(eidolaConfigDir(), { recursive: true });
    await writeFile(
      mcpAwakenSignalPath(),
      JSON.stringify({
        engram_id: 'ponytail-engram',
        workspace_root: '/tmp/workspace',
        engrams_dir: '/tmp/eidola',
        vessels_dir: '/tmp/eidola/vessels',
        ts: Date.now(),
      }),
      'utf8',
    );

    expect(await readMcpAwakenSignal()).toBeNull();
  });

  it('returns null when vessels_dir is missing', async () => {
    priorSignal = await backupSignalFile();
    await mkdir(eidolaConfigDir(), { recursive: true });
    await writeFile(
      mcpAwakenSignalPath(),
      JSON.stringify({
        engram_id: 'ponytail-engram',
        workspace_root: '/tmp/workspace',
        engrams_dir: '/tmp/eidola',
        engram_directory: '/tmp/eidola/ponytail-engram',
        ts: Date.now(),
      }),
      'utf8',
    );

    expect(await readMcpAwakenSignal()).toBeNull();
  });

  it('returns parsed signal when engram_directory and vessels_dir are present', async () => {
    priorSignal = await backupSignalFile();
    await writeMcpAwakenSignal({
      engram_id: 'ponytail-engram',
      workspace_root: '/tmp/workspace',
      engrams_dir: '/tmp/eidola',
      engram_directory: '/tmp/eidola/ponytail-engram-1.0.0/ponytail-engram',
      vessels_dir: '/tmp/eidola/ponytail-engram-1.0.0/vessels',
    });

    const signal = await readMcpAwakenSignal();
    expect(signal?.engram_id).toBe('ponytail-engram');
    expect(signal?.engram_directory).toContain('ponytail-engram-1.0.0');
    expect(signal?.vessels_dir).toContain('vessels');
  });
});

describe.skipIf(!hasPonytailReleaseBundle())('release-bundle: watchMcpAwakenSignal', () => {
  let priorSignal: string | null = null;
  let tempWorkspace: string | null = null;
  let closeServer: (() => Promise<void>) | null = null;
  let watchHandle: { close(): void } | null = null;

  afterEach(async () => {
    watchHandle?.close();
    watchHandle = null;

    if (closeServer) {
      await closeServer();
      closeServer = null;
    }

    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }

    await restoreSignalFile(priorSignal);
    priorSignal = null;
  });

  it('loads session from ponytail signal paths under Documents/Eidola', async () => {
    const fixture = await requirePonytailReleaseBundle();
    priorSignal = await backupSignalFile();
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-mcp-awaken-watch-'));

    await writeMcpAwakenSignal({
      engram_id: fixture.engramId,
      workspace_root: tempWorkspace,
      engrams_dir: fixture.engramsDir,
      engram_directory: fixture.engramDir,
      vessels_dir: fixture.vesselsDir,
    });

    const session = new SessionState();
    const stateSocket = createStateSocketServer(session, { port: 0 });
    await stateSocket.start();
    closeServer = () => stateSocket.close();

    const config = resolveEidolaRuntimeConfig({
      EIDOLA_ENGRAMS_DIR: fixture.engramsDir,
      EIDOLA_WORKSPACE: tempWorkspace,
    });

    watchHandle = watchMcpAwakenSignal(config, session, stateSocket);

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));

    expect(session.getActive()?.engram.id).toBe(fixture.engramId);
    expect(session.getActive()?.directory).toBe(fixture.engramDir);

    const buffer = stateSocket.getBuffer();
    expect(
      buffer.some(
        (entry) => entry.engram_id === fixture.engramId && entry.state === 'idle',
      ),
    ).toBe(true);
  });
});
