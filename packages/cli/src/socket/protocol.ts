import { normalizeVesselState, refineGenericWorkingState } from '../vendor/tool-state.js';
import { z } from 'zod';
import {
  STATE_PROTOCOL_VERSION,
  SURFACES,
  type StateBroadcast,
  type StateInboundEvent,
  type Surface,
  VESSEL_STATES,
} from './types.js';

const surfaceSchema = z.enum(SURFACES);

const inboundSchema = z.object({
  protocol_version: z.string(),
  ts: z.number(),
  surface: surfaceSchema,
  state: z.string(),
  tool: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface NormalizedInbound {
  event: StateInboundEvent;
  protocolMismatch: boolean;
  unknownState: boolean;
  normalizedState: string;
}

export function parseInboundLine(line: string): StateInboundEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const result = inboundSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }

  return result.data;
}

export function normalizeInbound(event: StateInboundEvent): NormalizedInbound {
  const protocolMismatch = event.protocol_version !== STATE_PROTOCOL_VERSION;
  const refinedState = normalizeVesselState(
    refineGenericWorkingState(event.state, event.tool),
  );
  const knownState = isKnownVesselState(refinedState);
  const unknownState = !knownState;
  const normalizedState = protocolMismatch || unknownState ? 'idle' : refinedState;

  return {
    event,
    protocolMismatch,
    unknownState,
    normalizedState,
  };
}

export function isKnownVesselState(state: string): state is (typeof VESSEL_STATES)[number] {
  return (VESSEL_STATES as readonly string[]).includes(state);
}

export function createBroadcast(
  state: string,
  engramId: string,
  expression: string,
  ts: number = Date.now(),
  tool?: string,
  visualState?: string,
): StateBroadcast {
  return {
    protocol_version: STATE_PROTOCOL_VERSION,
    ts,
    state,
    engram_id: engramId,
    expression,
    ...(visualState !== undefined && visualState !== state ? { visual_state: visualState } : {}),
    ...(tool !== undefined ? { tool } : {}),
  };
}

export function serializeBroadcast(broadcast: StateBroadcast): string {
  return `${JSON.stringify(broadcast)}\n`;
}

export function createInboundEvent(
  state: string,
  surface: Surface,
  ts: number = Date.now(),
): StateInboundEvent {
  return {
    protocol_version: STATE_PROTOCOL_VERSION,
    ts,
    surface,
    state,
  };
}

export function serializeInbound(event: StateInboundEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function isValidSurface(value: string): value is Surface {
  return (SURFACES as readonly string[]).includes(value);
}
