import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasPonytailReleaseBundle,
  PONYTAIL_BUNDLE_DIR,
  requirePonytailReleaseBundle,
} from '../integration/release-bundle-fixture.js';
import { writeFixtureEngram } from '../integration/local-engram-fixture.js';
import { linkEngramToWorkspace } from './link-engram.js';
import { cursorRulePath, readWorkspaceConfig } from './workspace-config.js';

async function copyEngramVariant(
  engramsDir: string,
  targetId: string,
  name: string,
): Promise<void> {
  const targetDir = join(engramsDir, targetId);
  await writeFixtureEngram(engramsDir, targetId);
  const engramYaml = await readFile(join(targetDir, 'engram.yaml'), 'utf8');
  await writeFile(
    join(targetDir, 'engram.yaml'),
    engramYaml.replace(/^name: .*/m, `name: ${name}`),
    'utf8',
  );
  await writeFile(join(targetDir, 'SOUL.md'), `# ${name}\n\n${name} voice.\n`, 'utf8');
}

describe('linkEngramToWorkspace', () => {
  let tempWorkspace: string | null = null;
  let tempEngrams: string | null = null;

  afterEach(async () => {
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
    if (tempEngrams) {
      await rm(tempEngrams, { recursive: true, force: true });
      tempEngrams = null;
    }
  });

  it('writes mdc rule and eidola.json', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-link-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-link-engrams-'));
    await writeFixtureEngram(tempEngrams, 'fixture-engram');

    const result = await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramsDir: tempEngrams,
    });

    expect(result.ok).toBe(true);
    expect(result.engramId).toBe('fixture-engram');

    const mdc = await readFile(result.mdcPath, 'utf8');
    expect(mdc).toContain('alwaysApply: true');
    expect(mdc).toContain('Fixture Engram');

    const config = await readWorkspaceConfig(tempWorkspace);
    expect(config?.active_engram_id).toBe('fixture-engram');
  });

  it('links release bundle engram from catalog discovery', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-link-release-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-engrams-release-'));
    const release = join(tempEngrams, 'ponytail-engram-1.0.0');
    const engramDir = join(release, 'ponytail-engram');
    await mkdir(join(release, '.cursor', 'rules'), { recursive: true });
    await writeFixtureEngram(release, 'ponytail-engram');
    const engramYaml = await readFile(join(engramDir, 'engram.yaml'), 'utf8');
    await writeFile(
      join(engramDir, 'engram.yaml'),
      engramYaml.replace(/^id: .*/m, 'id: ponytail').replace(/^name: .*/m, 'name: Ponytail'),
      'utf8',
    );
    const soul = await readFile(join(engramDir, 'SOUL.md'), 'utf8');
    await writeFile(
      join(release, '.cursor', 'rules', 'ponytail.mdc'),
      ['---', 'alwaysApply: false', 'description: "Ponytail bundle rule"', '---', '', soul].join(
        '\n',
      ),
      'utf8',
    );

    const result = await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'ponytail',
      engramsDir: tempEngrams,
    });

    expect(result.engramDirectory).toBe(engramDir);
    const mdc = await readFile(result.mdcPath, 'utf8');
    expect(mdc).toContain('alwaysApply: true');
    expect(mdc).toContain(soul.trim());
  });

  it('recompiles from SOUL.md when the bundled .mdc is stale', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-link-stale-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-engrams-stale-'));
    const engramDir = await writeFixtureEngram(tempEngrams, 'fixture-engram');
    await mkdir(join(tempEngrams, '.cursor', 'rules'), { recursive: true });
    await writeFile(
      join(tempEngrams, '.cursor', 'rules', 'fixture-engram.mdc'),
      ['---', 'alwaysApply: false', 'description: "Stale"', '---', '', 'Outdated soul text.'].join(
        '\n',
      ),
      'utf8',
    );

    const result = await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'fixture-engram',
      engramDirectory: engramDir,
      engramsDir: tempEngrams,
    });

    const mdc = await readFile(result.mdcPath, 'utf8');
    expect(mdc).not.toContain('Outdated soul text.');
    expect(mdc).toContain('Fixture Engram');
  });

  it('deactivates previous engram rule when switching', async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-link-switch-'));
    tempEngrams = await mkdtemp(join(tmpdir(), 'eidola-engrams-'));
    await mkdir(tempEngrams, { recursive: true });
    await copyEngramVariant(tempEngrams, 'alpha', 'Alpha');
    await copyEngramVariant(tempEngrams, 'beta', 'Beta');

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'alpha',
      engramsDir: tempEngrams,
    });

    await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: 'beta',
      engramsDir: tempEngrams,
    });

    const previousMdc = await readFile(cursorRulePath(tempWorkspace, 'alpha'), 'utf8');
    expect(previousMdc).toContain('alwaysApply: false');

    const activeMdc = await readFile(cursorRulePath(tempWorkspace, 'beta'), 'utf8');
    expect(activeMdc).toContain('alwaysApply: true');

    const config = await readWorkspaceConfig(tempWorkspace);
    expect(config?.active_engram_id).toBe('beta');
  });
});

describe.skipIf(!hasPonytailReleaseBundle())('release-bundle: linkEngramToWorkspace', () => {
  let tempWorkspace: string | null = null;

  afterEach(async () => {
    if (tempWorkspace) {
      await rm(tempWorkspace, { recursive: true, force: true });
      tempWorkspace = null;
    }
  });

  it('discovers nested ponytail bundle without explicit engramDirectory', async () => {
    const fixture = await requirePonytailReleaseBundle();
    tempWorkspace = await mkdtemp(join(tmpdir(), 'eidola-link-documents-'));

    const result = await linkEngramToWorkspace({
      workspaceRoot: tempWorkspace,
      engramId: fixture.engramId,
      engramsDir: fixture.engramsDir,
    });

    expect(result.ok).toBe(true);
    expect(result.engramId).toBe(fixture.engramId);
    expect(result.engramDirectory).toBe(fixture.engramDir);
    expect(result.engramDirectory).toContain(PONYTAIL_BUNDLE_DIR);

    const config = await readWorkspaceConfig(tempWorkspace);
    expect(config?.active_engram_id).toBe(fixture.engramId);
    expect(config?.engrams_dir).toBe(fixture.engramsDir);
  });
});
