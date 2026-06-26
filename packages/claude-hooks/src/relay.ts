#!/usr/bin/env node
import { stdin } from 'node:process';
import { pathToFileURL } from 'node:url';
import { mapHookToState } from './map.js';
import { sendStateToSocket } from './socket.js';
import {
  consumeTurnToolUsage,
  decrementTurnToolInFlight,
  incrementTurnToolInFlight,
  markTurnToolUsed,
  resetTurnToolUsage,
} from './turn-tracker.js';
import { writeWorkspaceFromCwd } from './workspace-registry.js';

const TOOL_START_HOOKS = new Set(['PreToolUse', 'SubagentStart']);
const TOOL_END_HOOKS = new Set(['PostToolUse', 'SubagentStop', 'PostToolUseFailure']);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

function parseHookPayload(raw: string): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Hook stdin may be empty for some lifecycle events.
  }

  return {};
}

export async function runRelay(hookName: string, rawInput = ''): Promise<void> {
  const payload = parseHookPayload(rawInput);
  await writeWorkspaceFromCwd(payload.cwd).catch(() => {
    // Workspace registry write must never block Claude Code.
  });

  const sessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;

  let toolsInFlight: number | undefined;

  if (hookName === 'UserPromptSubmit') {
    await resetTurnToolUsage(sessionId).catch(() => {
      // Turn tracking must never block Claude Code.
    });
  } else if (TOOL_START_HOOKS.has(hookName)) {
    await markTurnToolUsed(sessionId).catch(() => {
      // Turn tracking must never block Claude Code.
    });
    await incrementTurnToolInFlight(sessionId).catch(() => {
      // Turn tracking must never block Claude Code.
    });
  } else if (TOOL_END_HOOKS.has(hookName)) {
    toolsInFlight = await decrementTurnToolInFlight(sessionId).catch(() => undefined);
  }

  const mapping = mapHookToState(hookName, payload);
  if (!mapping) {
    return;
  }

  if (hookName === 'Stop' && mapping.state === 'success') {
    const toolUsed = await consumeTurnToolUsage(sessionId).catch(() => true);
    if (!toolUsed) {
      mapping.state = 'responding';
    }
  }

  if (toolsInFlight !== undefined) {
    mapping.metadata = { ...mapping.metadata, tools_in_flight: toolsInFlight };
  }

  await sendStateToSocket(mapping);
}

async function main(): Promise<void> {
  const hookName = process.argv[2];
  if (!hookName) {
    return;
  }

  const rawInput = await readStdin();
  await runRelay(hookName, rawInput);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return entry.replace(/\\/g, '/').endsWith('/relay.js');
  }
}

if (isMainModule()) {
  main()
    .catch(() => {
      // Silent — hook failure must never block Claude Code.
    })
    .finally(() => {
      process.exit(0);
    });
}
