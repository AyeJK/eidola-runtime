import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { uninstallNpmPackage } from './uninstall-npm-package.js';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function fakeSpawn(
  behavior: (child: FakeChildProcess) => void,
): (...args: unknown[]) => FakeChildProcess {
  return () => {
    const child = new FakeChildProcess();
    setImmediate(() => behavior(child));
    return child;
  };
}

describe('uninstallNpmPackage', () => {
  it('reports ok when npm exits 0', async () => {
    const spawnFn = fakeSpawn((child) => {
      child.stdout.emit('data', Buffer.from('removed 1 package\n'));
      child.emit('close', 0);
    });

    const result = await uninstallNpmPackage({ spawnFn: spawnFn as never });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('removed 1 package');
  });

  it('reports not-ok with npm output when npm exits non-zero', async () => {
    const spawnFn = fakeSpawn((child) => {
      child.stderr.emit('data', Buffer.from('npm error EPERM\n'));
      child.emit('close', 1);
    });

    const result = await uninstallNpmPackage({ spawnFn: spawnFn as never });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('EPERM');
  });

  it('reports not-ok when npm itself fails to spawn (e.g. not on PATH)', async () => {
    const spawnFn = fakeSpawn((child) => {
      child.emit('error', new Error('spawn npm.cmd ENOENT'));
    });

    const result = await uninstallNpmPackage({ spawnFn: spawnFn as never });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.output).toContain('ENOENT');
  });

  it('reports not-ok when the spawn call throws synchronously', async () => {
    const spawnFn = () => {
      throw new Error('boom');
    };

    const result = await uninstallNpmPackage({ spawnFn: spawnFn as never });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.output).toBe('boom');
  });
});
