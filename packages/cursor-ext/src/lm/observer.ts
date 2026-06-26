import type * as vscode from 'vscode';
import type { StreamLifecycleTracker } from '../state/tracker.js';

const PATCHED = Symbol('eidolaPatched');

interface PatchedModel {
  [PATCHED]?: true;
}

type LmNamespace = typeof vscode.lm & {
  onDidStartChatModelRequest?: vscode.Event<unknown>;
  onDidEndChatModelRequest?: vscode.Event<unknown>;
  onDidChangeChatModelRequestState?: vscode.Event<{ state: string }>;
};

type CursorAgentEvent = {
  state?: 'idle' | 'streaming' | 'done' | 'error';
};

type CursorNamespace = {
  cursor?: {
    agent?: {
      onDidChangeRunState?: vscode.Event<CursorAgentEvent>;
    };
  };
};

export function registerLmStreamObserver(
  vscodeApi: typeof vscode,
  tracker: StreamLifecycleTracker,
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];

  disposables.push(registerCursorAgentHooks(vscodeApi, tracker));
  disposables.push(registerProposedLmHooks(vscodeApi, tracker));
  disposables.push(registerSendRequestPatches(vscodeApi, tracker));

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

function registerCursorAgentHooks(
  vscodeApi: typeof vscode,
  tracker: StreamLifecycleTracker,
): vscode.Disposable {
  const cursor = (vscodeApi as unknown as CursorNamespace).cursor;
  const onDidChangeRunState = cursor?.agent?.onDidChangeRunState;

  if (!onDidChangeRunState) {
    return emptyDisposable();
  }

  return onDidChangeRunState((event) => {
    switch (event.state) {
      case 'streaming':
        tracker.onStreamStart();
        break;
      case 'done':
        tracker.onStreamEnd();
        break;
      case 'error':
        tracker.onError();
        break;
      case 'idle':
        tracker.onIdle();
        break;
      default:
        break;
    }
  });
}

function registerProposedLmHooks(
  vscodeApi: typeof vscode,
  tracker: StreamLifecycleTracker,
): vscode.Disposable {
  const lm = vscodeApi.lm as LmNamespace;

  const disposables: vscode.Disposable[] = [];

  if (lm.onDidStartChatModelRequest) {
    disposables.push(lm.onDidStartChatModelRequest(() => tracker.onStreamStart()));
  }

  if (lm.onDidEndChatModelRequest) {
    disposables.push(lm.onDidEndChatModelRequest(() => tracker.onStreamEnd()));
  }

  if (lm.onDidChangeChatModelRequestState) {
    disposables.push(
      lm.onDidChangeChatModelRequestState((event) => {
        if (event.state === 'error') {
          tracker.onError();
        }
      }),
    );
  }

  return {
    dispose: () => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}

function registerSendRequestPatches(
  vscodeApi: typeof vscode,
  tracker: StreamLifecycleTracker,
): vscode.Disposable {
  const patched = new WeakSet<object>();

  const patchModels = async (): Promise<void> => {
    try {
      const models = await vscodeApi.lm.selectChatModels();
      for (const model of models) {
        patchModelSendRequest(model, tracker, patched);
      }
    } catch {
      // Silent — model access may be unavailable until user consent.
    }
  };

  void patchModels();

  const changeDisposable = vscodeApi.lm.onDidChangeChatModels(() => {
    void patchModels();
  });

  return changeDisposable;
}

function patchModelSendRequest(
  model: vscode.LanguageModelChat,
  tracker: StreamLifecycleTracker,
  patched: WeakSet<object>,
): void {
  const marker = model as PatchedModel;
  if (marker[PATCHED] || patched.has(model)) {
    return;
  }

  marker[PATCHED] = true;
  patched.add(model);

  const original = model.sendRequest.bind(model);
  model.sendRequest = async (messages, options, token) => {
    tracker.onStreamStart();

    try {
      const response = await original(messages, options, token);
      void trackResponseStream(response, tracker);
      return response;
    } catch (error) {
      tracker.onError();
      throw error;
    }
  };
}

async function trackResponseStream(
  response: vscode.LanguageModelChatResponse,
  tracker: StreamLifecycleTracker,
): Promise<void> {
  try {
    for await (const _chunk of response.stream) {
      // Drain stream to detect completion.
    }
    tracker.onStreamEnd();
  } catch {
    tracker.onError();
  }
}

function emptyDisposable(): vscode.Disposable {
  return { dispose: () => undefined };
}
