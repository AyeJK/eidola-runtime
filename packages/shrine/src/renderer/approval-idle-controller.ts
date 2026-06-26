import {
  isTurnEndState,
  shouldArmApprovalIdleTimer,
} from '../shared/approval-idle-logic.js';
import {
  buildClipUrl,
  shouldLoopExpression,
  type ShrineStatePayload,
  type ShrineVesselConfig,
} from '../shared/types.js';

export class ApprovalIdleController {
  private config: ShrineVesselConfig | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inTurn = false;
  private engramId = '';
  private readonly onWaiting: (payload: ShrineStatePayload) => void;

  constructor(onWaiting: (payload: ShrineStatePayload) => void) {
    this.onWaiting = onWaiting;
  }

  setConfig(config: ShrineVesselConfig): void {
    this.config = config;
  }

  setEngramId(engramId: string): void {
    this.engramId = engramId;
  }

  disarm(): void {
    this.clearTimer();
    this.inTurn = false;
  }

  onState(payload: ShrineStatePayload): void {
    if (payload.source === 'approval-idle') {
      return;
    }

    this.clearTimer();

    const { state } = payload.broadcast;
    const tool = payload.broadcast.tool;

    if (isTurnEndState(state, this.inTurn)) {
      this.inTurn = false;
      return;
    }

    if (!this.inTurn && state === 'thinking') {
      this.inTurn = true;
    }

    if (!this.inTurn || !this.config) {
      return;
    }

    if (shouldArmApprovalIdleTimer(this.inTurn, state, tool)) {
      this.armTimer();
    }
  }

  private armTimer(): void {
    const config = this.config;
    if (!config) {
      return;
    }

    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.inTurn) {
        return;
      }

      const waiting = buildApprovalIdlePayload(config, this.engramId);
      this.onWaiting(waiting);
    }, config.approvalIdleMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export function buildApprovalIdlePayload(
  config: ShrineVesselConfig,
  engramId: string,
  ts: number = Date.now(),
): ShrineStatePayload {
  const expression = 'waiting.json';

  return {
    broadcast: {
      protocol_version: '1.0',
      ts,
      state: 'waiting',
      engram_id: engramId,
      expression,
    },
    clipUrl: buildClipUrl(config.pack, expression),
    loop: shouldLoopExpression('waiting', config.idleLoops),
    returnToIdle: false,
    source: 'approval-idle',
  };
}
