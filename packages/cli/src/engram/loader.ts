import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { EngramLoadError, type LoadedEngram } from './types.js';
import { parseEngramYaml, parseVesselYaml } from './parse.js';

const REQUIRED_FILES = ['SOUL.md', 'vessel.yaml', 'engram.yaml'] as const;

async function readRequiredFile(directory: string, filename: string): Promise<string> {
  const filePath = join(directory, filename);
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new EngramLoadError(
        `Engram directory is missing required file "${filename}".`,
        'MISSING_FILE',
        directory,
      );
    }
    throw error;
  }
}

function parseYamlFile<T>(content: string, filename: string, parser: (raw: unknown) => T): T {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EngramLoadError(`Failed to parse ${filename}: ${message}`, 'INVALID_YAML', undefined);
  }

  try {
    return parser(raw);
  } catch (error) {
    if (error instanceof EngramLoadError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new EngramLoadError(`Invalid ${filename}: ${message}`, 'INVALID_FIELD', undefined);
  }
}

export async function loadEngramFromDirectory(directory: string): Promise<LoadedEngram> {
  for (const filename of REQUIRED_FILES) {
    await readRequiredFile(directory, filename);
  }

  const [soul, vesselContent, engramContent] = await Promise.all(
    REQUIRED_FILES.map((filename) => readRequiredFile(directory, filename)),
  );

  const engram = parseYamlFile(engramContent, 'engram.yaml', parseEngramYaml);
  const vessel = parseYamlFile(vesselContent, 'vessel.yaml', parseVesselYaml);

  if (engram.id !== undefined) {
    const dirName = directory.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
    const releaseBundleDir = `${engram.id}-engram`;
    if (dirName && dirName !== engram.id && dirName !== releaseBundleDir) {
      throw new EngramLoadError(
        `Engram id "${engram.id}" does not match directory name "${dirName}".`,
        'ID_MISMATCH',
        directory,
      );
    }
  }

  return {
    directory,
    soul: soul.replace(/\r\n/g, '\n'),
    engram,
    vessel,
  };
}
