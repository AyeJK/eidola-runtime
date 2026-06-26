import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseEngramYaml } from './parse.js';
export interface EngramListMetadata {
  name?: string;
  description?: string;
  author?: string;
}

export interface EngramPreviewInfo {
  vesselType: string;
  previewPath: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseLooseEngramMetadata(raw: unknown): EngramListMetadata | null {
  const data = asRecord(raw);
  if (!data) {
    return null;
  }

  const meta = asRecord(data.meta);
  const name = readString(data.name);
  const description = readString(meta?.description);
  const author = readString(meta?.author);

  if (!name && !description && !author) {
    return null;
  }

  return { name, description, author };
}

export function parseLooseVesselPreview(raw: unknown): { vesselType: string; pack: string; idleClip: string } | null {
  const data = asRecord(raw);
  if (!data) {
    return null;
  }

  let vesselType = readString(data.type);
  let pack = readString(data.pack);
  let expressions = asRecord(data.expressions);

  if (vesselType === 'component') {
    const fallback = asRecord(data.fallback);
    if (!fallback) {
      return null;
    }
    vesselType = readString(fallback.type);
    pack = readString(fallback.pack) ?? pack;
    expressions = asRecord(fallback.expressions) ?? expressions;
  }

  if (!vesselType || !pack || vesselType === 'component') {
    return null;
  }

  const idleClip = readString(expressions?.idle) ?? 'idle.json';
  return { vesselType, pack, idleClip };
}

export function humanizeEngramFolderId(id: string): string {
  const stem = id.replace(/-engram(?:[-_.]\d+.*)?$/i, '').replace(/[-_.]+/g, ' ').trim();
  if (!stem) {
    return id;
  }

  return stem
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function readSoulDisplayName(directory: string): Promise<string | undefined> {
  try {
    const soul = await readFile(join(directory, 'SOUL.md'), 'utf8');
    const frontmatterName = soul.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
    if (frontmatterName?.[1]) {
      return frontmatterName[1].trim();
    }

    const heading = soul.match(/^#\s+(.+)$/m);
    if (heading?.[1]) {
      return heading[1].trim();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function readEngramIdFromDirectory(directory: string): Promise<string | undefined> {
  try {
    const raw = yaml.load(await readFile(join(directory, 'engram.yaml'), 'utf8'));
    const data = asRecord(raw);
    return readString(data?.id);
  } catch {
    return undefined;
  }
}

export async function readEngramListMetadata(directory: string, folderId: string): Promise<EngramListMetadata> {
  try {
    const raw = yaml.load(await readFile(join(directory, 'engram.yaml'), 'utf8'));
    try {
      const config = parseEngramYaml(raw);
      return {
        name: config.name,
        description: config.meta.description,
        author: config.meta.author,
      };
    } catch {
      const loose = parseLooseEngramMetadata(raw);
      if (loose?.name || loose?.description || loose?.author) {
        return {
          name: loose.name ?? (await readSoulDisplayName(directory)) ?? humanizeEngramFolderId(folderId),
          description: loose.description,
          author: loose.author,
        };
      }
    }
  } catch {
    // fall through
  }

  return {
    name: (await readSoulDisplayName(directory)) ?? humanizeEngramFolderId(folderId),
  };
}

export async function readEngramPreviewInfo(
  directory: string,
  vesselsDir: string,
): Promise<EngramPreviewInfo | null> {
  try {
    const raw = yaml.load(await readFile(join(directory, 'vessel.yaml'), 'utf8'));
    const parsed = parseLooseVesselPreview(raw);
    if (!parsed) {
      return null;
    }

    const clipPath = join(vesselsDir, parsed.pack, parsed.idleClip);
    await access(clipPath);
    return {
      vesselType: parsed.vesselType,
      previewPath: `${parsed.pack}/${parsed.idleClip}`,
    };
  } catch {
    return null;
  }
}
