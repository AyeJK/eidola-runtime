import { EngramLoadError } from './types.js';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * engram_version tracks a user's edit history, not runtime/spec compatibility —
 * there is no major-version gate here, only a well-formed-semver check.
 */
export function validateEngramVersion(version: string): void {
  const parsed = parseSemver(version);
  if (!parsed) {
    throw new EngramLoadError(
      `Unrecognised engram_version "${version}". Expected semver (e.g. "1.0.0").`,
      'INVALID_ENGRAM_VERSION',
    );
  }
}
