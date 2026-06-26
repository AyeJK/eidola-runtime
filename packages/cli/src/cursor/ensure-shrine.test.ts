import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isShrineRunning,
  isProcessAlive,
  readShrineLock,
  writeShrineLock,
} from './shrine-lock.js';
import { resolveShrineSurface, isHttpShrineSurface } from './shrine-surface.js';

describe('shrine surface resolution', () => {
  it('defaults to browser when config absent', () => {
    expect(resolveShrineSurface({})).toEqual({
      preset: 'browser',
      width: 1920,
      height: 1080,
    });
  });

  it('resolves kraken-elite-v2 for CAM HTTP mode', () => {
    const surface = resolveShrineSurface({ configSurface: 'kraken-elite-v2' });
    expect(surface.preset).toBe('kraken-elite-v2');
    expect(surface.circularMask).toBe(true);
    expect(isHttpShrineSurface(surface)).toBe(true);
  });

  it('parses custom widthxheight', () => {
    expect(resolveShrineSurface({ configSurface: '800x600' })).toEqual({
      preset: 'custom',
      width: 800,
      height: 600,
    });
  });
});

describe('shrine lock file', () => {
  const roots: string[] = [];

  afterEach(async () => {
    roots.length = 0;
  });

  async function makeWorkspace(): Promise<string> {
    const root = join(tmpdir(), `eidola-shrine-lock-${Date.now()}-${Math.random()}`);
    await mkdir(join(root, '.cursor'), { recursive: true });
    roots.push(root);
    return root;
  }

  it('detects alive shrine pid from lock file', async () => {
    const workspaceRoot = await makeWorkspace();
    await writeShrineLock(workspaceRoot, {
      pid: process.pid,
      surface: 'browser',
      started_at: new Date().toISOString(),
    });

    expect(isProcessAlive(process.pid)).toBe(true);
    expect(await isShrineRunning(workspaceRoot)).toBe(true);
  });

  it('treats stale pid as not running', async () => {
    const workspaceRoot = await makeWorkspace();
    await writeFile(
      join(workspaceRoot, '.cursor', 'eidola-shrine.lock'),
      `${JSON.stringify({ pid: 999_999_999, surface: 'browser', started_at: new Date().toISOString() })}\n`,
      'utf8',
    );

    expect(await isShrineRunning(workspaceRoot)).toBe(false);
    const lock = await readShrineLock(workspaceRoot);
    expect(lock?.pid).toBe(999_999_999);
  });
});
