import { access, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readEngramIdFromDirectory, readEngramListMetadata, readEngramPreviewInfo } from './list-metadata.js';
import type { EngramListEntry } from './registry-types.js';

const SKIP_DIR_NAMES = new Set(['vessels', '.cursor', '.git', 'node_modules']);

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function hasEngramYaml(path: string): Promise<boolean> {
  try {
    await access(join(path, 'engram.yaml'));
    return true;
  } catch {
    return false;
  }
}

async function hasVesselsDir(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function buildEntry(
  engramDir: string,
  vesselsDir: string,
  fallbackId: string,
): Promise<EngramListEntry> {
  const metadata = await readEngramListMetadata(engramDir, fallbackId);
  const id = (await readEngramIdFromDirectory(engramDir)) ?? fallbackId;
  const preview = await readEngramPreviewInfo(engramDir, vesselsDir);

  return {
    id,
    name: metadata.name,
    description: metadata.description,
    author: metadata.author,
    previewPath: preview?.previewPath,
    vesselType: preview?.vesselType,
    engramDir,
    vesselsDir,
  };
}

async function scanReleaseBundle(bundleDir: string): Promise<EngramListEntry[]> {
  const bundleVesselsDir = join(bundleDir, 'vessels');
  const vesselsDir = (await hasVesselsDir(bundleVesselsDir))
    ? bundleVesselsDir
    : join(bundleDir, 'vessels');

  let entries: string[];
  try {
    entries = await readdir(bundleDir);
  } catch {
    return [];
  }

  const results: EngramListEntry[] = [];

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry) || entry.startsWith('.')) {
      continue;
    }

    const childPath = join(bundleDir, entry);
    if (!(await isDirectory(childPath))) {
      continue;
    }

    if (await hasEngramYaml(childPath)) {
      results.push(await buildEntry(childPath, vesselsDir, entry));
    }
  }

  return results;
}

export async function discoverEngramEntries(
  root: string,
  defaultVesselsDir: string,
): Promise<EngramListEntry[]> {
  if (await hasEngramYaml(root)) {
    const fallbackId = root.split(/[/\\]/).pop() ?? 'engram';
    return [await buildEntry(root, defaultVesselsDir, fallbackId)];
  }

  const releaseEntries = await scanReleaseBundle(root);
  if (releaseEntries.length > 0) {
    return releaseEntries;
  }

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const results: EngramListEntry[] = [];

  for (const entry of entries) {
    if (SKIP_DIR_NAMES.has(entry) || entry.startsWith('.')) {
      continue;
    }

    const entryPath = join(root, entry);
    if (!(await isDirectory(entryPath))) {
      continue;
    }

    if (await hasEngramYaml(entryPath)) {
      results.push(await buildEntry(entryPath, defaultVesselsDir, entry));
      continue;
    }

    const nestedRelease = await scanReleaseBundle(entryPath);
    results.push(...nestedRelease);
  }

  return results.sort((a, b) => a.id.localeCompare(b.id));
}
