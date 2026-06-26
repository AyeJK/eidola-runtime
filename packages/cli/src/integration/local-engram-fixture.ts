import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FIXTURE_ENGRAM_ID = 'fixture-engram';
export const FIXTURE_ENGRAM_NAME = 'Fixture Engram';

/**
 * Writes a minimal, self-contained Engram directory for integration tests that
 * need a real on-disk Engram but don't want to depend on the archived Camina
 * fixture or the Documents/Eidola release bundle. Mirrors the flat
 * engramsDir/{id}/ layout that discoverEngramEntries supports.
 */
export async function writeFixtureEngram(engramsDir: string, id = FIXTURE_ENGRAM_ID): Promise<string> {
  const engramDir = join(engramsDir, id);
  await mkdir(engramDir, { recursive: true });

  await writeFile(
    join(engramDir, 'engram.yaml'),
    [
      'engram_version: "1.0.0"',
      `id: ${id}`,
      `name: ${FIXTURE_ENGRAM_NAME}`,
      'voice_id: null',
      'meta:',
      '  author: test-author',
      '  created: "2026-06-22"',
      '  description: Fixture persona for integration tests.',
      '  tags: [assistant, fixture]',
      'extensions: {}',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'vessel.yaml'),
    [
      'type: lottie',
      'pack: fixture-pack',
      'expressions:',
      '  idle: idle.json',
      '  thinking: thinking.json',
      '  responding: responding.json',
      '  error: error.json',
      '  working: working.json',
      'transitions:',
      '  default: crossfade',
      '  duration_ms: 300',
      'playback:',
      '  idle_loops: true',
      '  approval_idle_ms: 3000',
      '  success_hold_ms: 3000',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(engramDir, 'SOUL.md'),
    `# ${FIXTURE_ENGRAM_NAME}\n\nA test fixture persona used for integration tests.\n`,
    'utf8',
  );

  return engramDir;
}

/** Creates a fresh temp engramsDir with the fixture Engram and returns both paths. */
export async function createFixtureEngramsDir(
  id = FIXTURE_ENGRAM_ID,
): Promise<{ engramsDir: string; engramDir: string }> {
  const engramsDir = await mkdtemp(join(tmpdir(), 'eidola-fixture-engrams-'));
  const engramDir = await writeFixtureEngram(engramsDir, id);
  return { engramsDir, engramDir };
}
