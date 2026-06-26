#!/usr/bin/env node
import { stdin } from 'node:process';
import { pathToFileURL } from 'node:url';
import { mapHookToState } from './map.js';
import { sendStateToSocket } from './socket.js';
import {
  decrementTurnToolInFlight,
  incrementTurnToolInFlight,
  readTurnState,
  TOOL_END_HOOKS,
  TOOL_START_HOOKS,
  updateTurnForHook,
} from './turn-tracker.js';

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
  const priorTurnState = readTurnState();
  const turnState = updateTurnForHook(hookName);

  let toolsInFlight: number | undefined;
  if (TOOL_START_HOOKS.has(hookName)) {
    incrementTurnToolInFlight();
  } else if (TOOL_END_HOOKS.has(hookName)) {
    toolsInFlight = decrementTurnToolInFlight();
  }

  const mapping = mapHookToState(hookName, payload, turnState, priorTurnState);
  if (!mapping) {
    return;
  }

  await sendStateToSocket({
    ...mapping,
    metadata: {
      ...mapping.metadata,
      first_tool_started: turnState.firstToolStarted,
      ...(toolsInFlight !== undefined ? { tools_in_flight: toolsInFlight } : {}),
    },
  });
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
      // Silent — hook failure must never block the agent.
    })
    .finally(() => {
      process.exit(0);
    });
}
