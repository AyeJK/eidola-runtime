import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eidolaConfigDir } from '@eidola/tool-state/workspace-registry';

/**
 * Tracks whether any tool ran during the current turn, so the `Stop` hook
 * can tell a chat-only reply (-> `responding`) from a tool-assisted one
 * (-> `success`). Claude Code spawns a fresh process per hook invocation,
 * so this has to round-trip through a file rather than an in-memory flag —
 * same constraint `workspace-registry.ts` already works around.
 */

function turnsDir(configDir: string = eidolaConfigDir()): string {
  return join(configDir, 'turns');
}

function turnStatePath(sessionId: string, configDir: string = eidolaConfigDir()): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(turnsDir(configDir), `${safeId}.json`);
}

interface TurnStateFile {
  tool_used: boolean;
  in_flight: number;
}

async function readTurnStateFile(
  sessionId: string,
  configDir: string,
): Promise<TurnStateFile> {
  const path = turnStatePath(sessionId, configDir);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<TurnStateFile>;
    return {
      tool_used: parsed.tool_used === true,
      in_flight: typeof parsed.in_flight === 'number' && parsed.in_flight > 0 ? parsed.in_flight : 0,
    };
  } catch {
    return { tool_used: false, in_flight: 0 };
  }
}

async function writeTurnStateFile(
  sessionId: string,
  configDir: string,
  state: TurnStateFile,
): Promise<void> {
  await mkdir(turnsDir(configDir), { recursive: true });
  await writeFile(turnStatePath(sessionId, configDir), JSON.stringify(state), 'utf8');
}

export async function resetTurnToolUsage(
  sessionId: string | undefined,
  configDir: string = eidolaConfigDir(),
): Promise<void> {
  if (!sessionId) {
    return;
  }
  await writeTurnStateFile(sessionId, configDir, { tool_used: false, in_flight: 0 });
}

export async function markTurnToolUsed(
  sessionId: string | undefined,
  configDir: string = eidolaConfigDir(),
): Promise<void> {
  if (!sessionId) {
    return;
  }
  const current = await readTurnStateFile(sessionId, configDir);
  await writeTurnStateFile(sessionId, configDir, { ...current, tool_used: true });
}

/** Increments the in-flight tool counter for a session. Called on tool-start hooks. */
export async function incrementTurnToolInFlight(
  sessionId: string | undefined,
  configDir: string = eidolaConfigDir(),
): Promise<number> {
  if (!sessionId) {
    return 0;
  }
  const current = await readTurnStateFile(sessionId, configDir);
  const next = { ...current, tool_used: true, in_flight: current.in_flight + 1 };
  await writeTurnStateFile(sessionId, configDir, next);
  return next.in_flight;
}

/**
 * Decrements the in-flight tool counter for a session, floored at 0 so a
 * missed increment or duplicate decrement (e.g. a crashed hook process)
 * can never wedge the counter negative. Called on tool-end hooks.
 */
export async function decrementTurnToolInFlight(
  sessionId: string | undefined,
  configDir: string = eidolaConfigDir(),
): Promise<number> {
  if (!sessionId) {
    return 0;
  }
  const current = await readTurnStateFile(sessionId, configDir);
  const next = { ...current, in_flight: Math.max(0, current.in_flight - 1) };
  await writeTurnStateFile(sessionId, configDir, next);
  return next.in_flight;
}

/** Reads the current turn's tool-usage flag and clears its file. Defaults to `true` (the safer/existing `success` branch) when unknown. */
export async function consumeTurnToolUsage(
  sessionId: string | undefined,
  configDir: string = eidolaConfigDir(),
): Promise<boolean> {
  if (!sessionId) {
    return true;
  }

  const path = turnStatePath(sessionId, configDir);
  let toolUsed = true;
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { tool_used?: unknown };
    if (typeof parsed.tool_used === 'boolean') {
      toolUsed = parsed.tool_used;
    }
  } catch {
    // No tracked turn (e.g. Stop without a preceding UserPromptSubmit) — assume tool-used.
  }

  await rm(path, { force: true }).catch(() => {
    // Cleanup is best-effort; a stale file is overwritten by the next reset.
  });

  return toolUsed;
}
