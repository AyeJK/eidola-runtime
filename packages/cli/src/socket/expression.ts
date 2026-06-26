import type { VesselConfig } from '../engram/types.js';
import { isWorkingClusterState } from '../vendor/tool-state.js';

const IDLE_CLIP = 'idle.json';

function lookupExpression(state: string, vessel: VesselConfig): string | undefined {
  return vessel.expressions[state];
}

export function resolveExpressionClip(state: string, vessel: VesselConfig | null): string {
  if (!vessel) {
    return IDLE_CLIP;
  }

  const direct = lookupExpression(state, vessel);
  if (direct) {
    return direct;
  }

  if (isWorkingClusterState(state) && state !== 'thinking') {
    const workingClip = lookupExpression('working', vessel);
    if (workingClip) {
      return workingClip;
    }
  }

  return vessel.expressions.idle ?? IDLE_CLIP;
}
