import * as vscode from 'vscode';
import { registerLmStreamObserver } from './lm/observer.js';
import { StateSocketWriter } from './socket/client.js';
import { createStreamLifecycleTracker } from './state/tracker.js';

let socketWriter: StateSocketWriter | undefined;
let lifecycleTracker: ReturnType<typeof createStreamLifecycleTracker> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  socketWriter = new StateSocketWriter();
  lifecycleTracker = createStreamLifecycleTracker(socketWriter);

  context.subscriptions.push({
    dispose: () => {
      lifecycleTracker?.dispose();
      socketWriter?.dispose();
      lifecycleTracker = undefined;
      socketWriter = undefined;
    },
  });

  context.subscriptions.push(registerLmStreamObserver(vscode, lifecycleTracker));

  // Prime connection in background; failures are silent.
  socketWriter.emit('idle');
}

export function deactivate(): void {
  lifecycleTracker?.dispose();
  socketWriter?.dispose();
  lifecycleTracker = undefined;
  socketWriter = undefined;
}
