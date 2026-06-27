import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readEngramIdFromDirectory } from '../engram/list-metadata.js';

export const PONYTAIL_BUNDLE_DIR = 'ponytail-engram-1.0.0';
export const PONYTAIL_ENGRAM_DIR = 'ponytail-engram';

/** Default user folder — override with EIDOLA_ENGRAMS_DIR in CI. */
export function resolveTestEngramsDir(): string {
  const env = process.env.EIDOLA_ENGRAMS_DIR?.trim();
  if (env) {
    return resolve(env);
  }
  return join(homedir(), 'Documents', 'Eidola');
}

export interface PonytailReleaseFixture {
  engramsDir: string;
  bundleRoot: string;
  engramDir: string;
  vesselsDir: string;
  engramId: string;
}

export function releaseBundleSkipMessage(): string {
  const engramsDir = resolveTestEngramsDir();
  return (
    `release-bundle tests require ${join(engramsDir, PONYTAIL_BUNDLE_DIR, PONYTAIL_ENGRAM_DIR, 'engram.yaml')} ` +
    `(set EIDOLA_ENGRAMS_DIR or install ponytail release bundle under Documents/Eidola)`
  );
}

export function hasPonytailReleaseBundle(): boolean {
  const engramsDir = resolveTestEngramsDir();
  return existsSync(join(engramsDir, PONYTAIL_BUNDLE_DIR, PONYTAIL_ENGRAM_DIR, 'engram.yaml'));
}

export async function requirePonytailReleaseBundle(): Promise<PonytailReleaseFixture> {
  if (!hasPonytailReleaseBundle()) {
    throw new Error(releaseBundleSkipMessage());
  }

  const engramsDir = resolveTestEngramsDir();
  const bundleRoot = join(engramsDir, PONYTAIL_BUNDLE_DIR);
  const engramDir = join(bundleRoot, PONYTAIL_ENGRAM_DIR);
  const vesselsDir = join(bundleRoot, 'vessels');
  const engramId = (await readEngramIdFromDirectory(engramDir)) ?? 'ponytail-engram';

  return { engramsDir, bundleRoot, engramDir, vesselsDir, engramId };
}
