import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

import { writeWorkspaceRegistry } from '../vendor/mcp.js';
import { ShrineHttpServer } from './index.js';

/**
 * Sprint 5.2.1 Task 17 — sleeping from one Shrine "window" (HTTP client) must
 * broadcast `asleep` over SSE so every other open window converges on the
 * same active state without a refresh. Mirrors the existing
 * multi-engram-bind.test.ts release-bundle fixture shape.
 */
async function writeMinimalEngram(engramsDir: string, id: string): Promise<void> {
  const engramDir = join(engramsDir, id);
  const vesselsDir = join(engramsDir, 'vessels');
  await mkdir(engramDir, { recursive: true });
  await mkdir(vesselsDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      `id: ${id}`,
      `name: ${id}`,
      'voice_id: null',
      'meta:',
      '  author: test',
      '  created: "2026-06-25"',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    ['type: lottie', 'pack: pack', 'expressions:', '  idle: idle.json'].join('\n'),
    'utf8',
  );

  await writeFile(join(engramDir, 'SOUL.md'), `# ${id}\n\nTest soul.\n`, 'utf8');
  await writeFile(join(vesselsDir, 'idle.json'), '{}', 'utf8');
}

interface SseMessage {
  type: string;
  payload: unknown;
}

/** Minimal SSE line-reader over a raw fetch stream — no EventSource in Node test env. */
async function waitForSseMessage(
  url: string,
  predicate: (message: SseMessage) => boolean,
  timeoutMs = 5000,
): Promise<SseMessage> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('SSE response has no readable body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error('SSE stream ended before matching message arrived');
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const chunk of events) {
        const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) {
          continue;
        }
        const message = JSON.parse(dataLine.slice('data: '.length)) as SseMessage;
        if (predicate(message)) {
          return message;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

describe('Shrine sleep/awaken SSE convergence across multiple clients', () => {
  let server: ShrineHttpServer | null = null;
  let tempEngramsDir: string | null = null;
  let tempWorkspace: string | null = null;
  let tempConfigDir: string | null = null;
  const previousConfigDirEnv = process.env.EIDOLA_SHRINE_CONFIG_DIR;
  const port = 19743 + Math.floor(Math.random() * 1000);

  afterEach(async () => {
    server?.stop();
    server = null;

    if (tempEngramsDir) {
      await rm(tempEngramsDir, { recursive: true, force: true });
      tempEngramsDir = null;
    }
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
    if (tempConfigDir) {
      await rm(tempConfigDir, { recursive: true, force: true });
      tempConfigDir = null;
    }
    if (previousConfigDirEnv === undefined) {
      delete process.env.EIDOLA_SHRINE_CONFIG_DIR;
    } else {
      process.env.EIDOLA_SHRINE_CONFIG_DIR = previousConfigDirEnv;
    }
  });

  it('sleeping via HTTP broadcasts asleep to every connected Shrine window', async () => {
    tempEngramsDir = await mkdtemp(join(tmpdir(), 'eidola-shrine-sse-engrams-'));
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-shrine-sse-workspace-'));
    tempConfigDir = await mkdtemp(join(tmpdir(), 'eidola-shrine-sse-config-'));
    process.env.EIDOLA_SHRINE_CONFIG_DIR = tempConfigDir;
    await writeMinimalEngram(tempEngramsDir, 'alpha');
    await writeWorkspaceRegistry(tempWorkspace);

    server = new ShrineHttpServer({ port });
    await server.start();

    const base = `http://127.0.0.1:${port}`;

    const folderResponse = await fetch(`${base}/shrine/api/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tempEngramsDir }),
    });
    expect(folderResponse.ok).toBe(true);

    // Two independent "windows" subscribing to the same SSE stream.
    const windowA = waitForSseMessage(`${base}/shrine/events`, (m) => m.type === 'awakened');
    const windowB = waitForSseMessage(`${base}/shrine/events`, (m) => m.type === 'awakened');

    const awakenResponse = await fetch(`${base}/shrine/api/awaken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engram_id: 'alpha' }),
    });
    expect(awakenResponse.ok).toBe(true);

    const [awakenedA, awakenedB] = await Promise.all([windowA, windowB]);
    expect((awakenedA.payload as { engram_id: string }).engram_id).toBe('alpha');
    expect((awakenedB.payload as { engram_id: string }).engram_id).toBe('alpha');

    const activeAfterAwaken = await fetch(`${base}/shrine/api/active`);
    const activePayload = (await activeAfterAwaken.json()) as { engram_id: string | null };
    expect(activePayload.engram_id).toBe('alpha');

    const sleepWindowA = waitForSseMessage(`${base}/shrine/events`, (m) => m.type === 'asleep');
    const sleepWindowB = waitForSseMessage(`${base}/shrine/events`, (m) => m.type === 'asleep');

    const sleepResponse = await fetch(`${base}/shrine/api/sleep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engram_id: 'alpha' }),
    });
    expect(sleepResponse.ok).toBe(true);

    const [asleepA, asleepB] = await Promise.all([sleepWindowA, sleepWindowB]);
    expect((asleepA.payload as { engram_id: string }).engram_id).toBe('alpha');
    expect((asleepB.payload as { engram_id: string }).engram_id).toBe('alpha');

    const activeAfterSleep = await fetch(`${base}/shrine/api/active`);
    const clearedPayload = (await activeAfterSleep.json()) as { engram_id: string | null };
    expect(clearedPayload.engram_id).toBeNull();
  }, 15000);
});
