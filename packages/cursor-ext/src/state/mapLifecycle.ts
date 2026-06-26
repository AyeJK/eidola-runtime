import {
  type CursorVesselState,
  StreamLifecycle,
  type StreamLifecycleEvent,
} from './types.js';

export function mapStreamLifecycleToState(
  event: StreamLifecycleEvent,
): CursorVesselState {
  switch (event) {
    case StreamLifecycle.StreamStart:
      return 'thinking';
    case StreamLifecycle.StreamEnd:
      return 'responding';
    case StreamLifecycle.Error:
      return 'error';
    case StreamLifecycle.Idle:
      return 'idle';
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
