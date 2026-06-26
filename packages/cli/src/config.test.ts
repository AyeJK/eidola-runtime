import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as config from './config.js';
import * as shrineFolderConfig from './shrine-folder-config.js';

describe('resolveEidolaPaths', () => {
  it('defaults repo root to the monorepo root', () => {
    const paths = config.resolveEidolaPaths({});

    expect(existsSync(join(paths.repoRoot, 'package.json'))).toBe(true);
  });

  describe('dev and published install share the shrine.json / EIDOLA_ENGRAMS_DIR default', () => {
    let tempRoot: string;

    afterEach(() => {
      vi.restoreAllMocks();
      if (tempRoot) {
        rmSync(tempRoot, { recursive: true, force: true });
        tempRoot = '';
      }
    });

    it('uses shrine.json engramsDir when EIDOLA_ENGRAMS_DIR is unset', () => {
      tempRoot = mkdtempSync(join(tmpdir(), 'eidola-published-'));
      const engramsDir = join(tempRoot, 'Eidola');
      mkdirSync(engramsDir);

      vi.spyOn(shrineFolderConfig, 'readShrineEngramsDirSync').mockReturnValue(resolve(engramsDir));

      const paths = config.resolveEidolaPaths({
        EIDOLA_ROOT: tempRoot,
        EIDOLA_FORCE_PUBLISHED: '1',
      });

      expect(paths.engramsDir).toBe(resolve(engramsDir));
    });

    it('falls back to repoRoot when shrine.json is absent and EIDOLA_ENGRAMS_DIR is unset', () => {
      tempRoot = mkdtempSync(join(tmpdir(), 'eidola-dev-'));

      vi.spyOn(shrineFolderConfig, 'readShrineEngramsDirSync').mockReturnValue(undefined);

      const paths = config.resolveEidolaPaths({
        EIDOLA_ROOT: tempRoot,
      });

      expect(paths.engramsDir).toBe(resolve(tempRoot));
    });

    it('prefers EIDOLA_ENGRAMS_DIR over shrine.json', () => {
      tempRoot = mkdtempSync(join(tmpdir(), 'eidola-published-'));
      const explicitDir = join(tempRoot, 'explicit-engrams');
      mkdirSync(explicitDir);

      vi.spyOn(shrineFolderConfig, 'readShrineEngramsDirSync').mockReturnValue(join(tempRoot, 'shrine-only'));

      const paths = config.resolveEidolaPaths({
        EIDOLA_ROOT: tempRoot,
        EIDOLA_ENGRAMS_DIR: explicitDir,
        EIDOLA_FORCE_PUBLISHED: '1',
      });

      expect(paths.engramsDir).toBe(resolve(explicitDir));
    });
  });
});

describe('inferWorkspaceRoot', () => {
  it('uses process.cwd for published install when EIDOLA_WORKSPACE unset', () => {
    const cwd = resolve(process.cwd());
    const root = config.inferWorkspaceRoot('/unused', { EIDOLA_FORCE_PUBLISHED: '1' });
    expect(root).toBe(cwd);
  });

  it('prefers EIDOLA_WORKSPACE over cwd', () => {
    const root = config.inferWorkspaceRoot('/unused', {
      EIDOLA_FORCE_PUBLISHED: '1',
      EIDOLA_WORKSPACE: '/tmp/my-project',
    });
    expect(root).toBe(resolve('/tmp/my-project'));
  });

  it('uses WORKSPACE_FOLDER_PATHS when set', () => {
    const root = config.inferWorkspaceRoot('/unused', {
      EIDOLA_FORCE_PUBLISHED: '1',
      WORKSPACE_FOLDER_PATHS: '/projects/foo;/projects/bar',
    });
    expect(root).toBe(resolve('/projects/foo'));
  });
});
