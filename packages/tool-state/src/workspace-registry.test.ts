import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readWorkspaceRegistry,
  workspaceRegistryPath,
  writeWorkspaceFromCwd,
  writeWorkspaceRegistry,
} from './workspace-registry.js';

// Single test suite covering the `~/.eidola/workspace.json` write format —
// both `@eidola/cli` (writeWorkspaceRegistry, knows the root directly)
// and `@eidola/claude-hooks` (writeWorkspaceFromCwd, only has a hook cwd)
// are thin callers of the same writer exercised here.
describe('workspace-registry', () => {
  let configDir: string;

  afterEach(async () => {
    if (configDir) {
      await rm(configDir, { recursive: true, force: true });
    }
  });

  describe('writeWorkspaceRegistry / readWorkspaceRegistry', () => {
    it('writes and reads back workspace_root and updated_at', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-'));

      await writeWorkspaceRegistry('/some/project/dir', configDir);

      const raw = await readFile(workspaceRegistryPath(configDir), 'utf8');
      const parsed = JSON.parse(raw) as { workspace_root: string; updated_at: string };
      expect(parsed.workspace_root).toBe(resolve('/some/project/dir'));
      expect(typeof parsed.updated_at).toBe('string');

      const read = await readWorkspaceRegistry(configDir);
      expect(read?.workspace_root).toBe(resolve('/some/project/dir'));
    });

    it('overwrites the previous workspace_root on a later call', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-'));

      await writeWorkspaceRegistry('/first/dir', configDir);
      await writeWorkspaceRegistry('/second/dir', configDir);

      const read = await readWorkspaceRegistry(configDir);
      expect(read?.workspace_root).toBe(resolve('/second/dir'));
    });

    it('readWorkspaceRegistry returns null when no file exists', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-'));
      await expect(readWorkspaceRegistry(configDir)).resolves.toBeNull();
    });
  });

  describe('writeWorkspaceFromCwd', () => {
    it('writes workspace_root from a hook payload cwd', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-cwd-'));

      await writeWorkspaceFromCwd('/some/project/dir', configDir);

      const raw = await readFile(workspaceRegistryPath(configDir), 'utf8');
      const parsed = JSON.parse(raw) as { workspace_root: string; updated_at: string };
      expect(parsed.workspace_root).toBe(resolve('/some/project/dir'));
      expect(typeof parsed.updated_at).toBe('string');
    });

    it('overwrites the previous workspace_root on a later call', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-cwd-'));

      await writeWorkspaceFromCwd('/first/dir', configDir);
      await writeWorkspaceFromCwd('/second/dir', configDir);

      const raw = await readFile(workspaceRegistryPath(configDir), 'utf8');
      const parsed = JSON.parse(raw) as { workspace_root: string };
      expect(parsed.workspace_root).toBe(resolve('/second/dir'));
    });

    it('is a no-op when cwd is missing or not a usable string', async () => {
      configDir = await mkdtemp(join(tmpdir(), 'eidola-workspace-registry-cwd-'));

      await writeWorkspaceFromCwd(undefined, configDir);
      await writeWorkspaceFromCwd(42, configDir);
      await writeWorkspaceFromCwd('   ', configDir);

      await expect(readFile(workspaceRegistryPath(configDir), 'utf8')).rejects.toThrow();
    });
  });
});
