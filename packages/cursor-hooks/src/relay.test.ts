import { describe, expect, it } from 'vitest';

import { extractToolName, mapHookToState } from './map.js';

import { buildStatePayload, serializeStatePayload } from './payload.js';

import { runRelay } from './relay.js';

import { sendStateToSocket } from './socket.js';

import { createServer, type Server } from 'node:net';



describe('mapHookToState', () => {

  it('maps thinking lifecycle hooks', () => {

    expect(mapHookToState('beforeSubmitPrompt')).toEqual({ state: 'thinking' });

    expect(mapHookToState('afterAgentThought')).toEqual({ state: 'thinking' });

    expect(mapHookToState('postToolUse', { tool_name: 'Grep' })).toEqual({

      state: 'thinking',

      tool: 'Grep',

    });

  });



  it('maps search tools on preToolUse to searching', () => {

    for (const tool of ['Grep', 'Glob', 'Read', 'SemanticSearch']) {

      expect(mapHookToState('preToolUse', { tool_name: tool })).toEqual({

        state: 'searching',

        tool,

      });

    }

  });



  it('maps write tools on preToolUse to writing', () => {

    for (const tool of ['Write', 'StrReplace', 'EditNotebook', 'Delete']) {

      expect(mapHookToState('preToolUse', { tool_name: tool })).toEqual({

        state: 'writing',

        tool,

      });

    }

  });



  it('maps shell and MCP approval gates to attention', () => {

    expect(mapHookToState('preToolUse', { tool_name: 'Shell' })).toEqual({

      state: 'working',

      tool: 'Shell',

    });

    expect(mapHookToState('beforeShellExecution', { command: 'pnpm test' })).toEqual({

      state: 'attention',

      tool: 'Shell',

    });

    expect(

      mapHookToState('beforeMCPExecution', { tool_name: 'mcp__eidola__awaken' }),

    ).toEqual({

      state: 'attention',

      tool: 'mcp__eidola__awaken',

    });

  });



  it('maps Task explore subagents to searching', () => {

    expect(

      mapHookToState('preToolUse', {

        tool_name: 'Task',

        tool_input: { subagent_type: 'explore' },

      }),

    ).toEqual({

      state: 'searching',

      tool: 'Task',

    });

  });



  it('maps skill file reads to searching', () => {

    expect(

      mapHookToState('preToolUse', {

        tool_name: 'Read',

        tool_input: { path: 'C:/Users/me/.cursor/skills/design-planner/SKILL.md' },

      }),

    ).toEqual({

      state: 'searching',

      tool: 'Read',

    });

  });



  it('maps response and failure hooks', () => {

    expect(mapHookToState('afterAgentResponse')).toEqual({ state: 'success' });

    expect(
      mapHookToState('afterAgentResponse', {}, {
        toolsUsed: true,
        firstToolStarted: true,
        inTurn: true,
        responseDelivered: false,
      }),
    ).toEqual({ state: 'success' });

    expect(

      mapHookToState('postToolUseFailure', {

        tool_name: 'Shell',

        failure_type: 'error',

      }),

    ).toEqual({

      state: 'error',

      tool: 'Shell',

    });

    expect(

      mapHookToState('postToolUseFailure', {

        tool_name: 'Shell',

        failure_type: 'timeout',

      }),

    ).toEqual({

      state: 'error',

      tool: 'Shell',

    });

    expect(

      mapHookToState('postToolUseFailure', {

        tool_name: 'mcp__eidola__awaken',

        failure_type: 'permission_denied',

      }),

    ).toEqual({

      state: 'attention',

      tool: 'mcp__eidola__awaken',

    });

  });



  it('maps stop hook by status', () => {

    expect(mapHookToState('stop', { status: 'completed' }, {
      toolsUsed: false,
      firstToolStarted: false,
      inTurn: false,
      responseDelivered: false,
    })).toEqual({ state: 'success' });

    expect(
      mapHookToState(
        'stop',
        { status: 'completed' },
        { toolsUsed: false, firstToolStarted: false, inTurn: false, responseDelivered: false },
        { toolsUsed: true, firstToolStarted: true, inTurn: true, responseDelivered: true },
      ),
    ).toEqual({ state: 'idle' });

    expect(mapHookToState('stop', { status: 'aborted' })).toEqual({ state: 'idle' });

    expect(mapHookToState('stop', { status: 'error' })).toEqual({ state: 'error' });

  });



  it('maps sessionStart with vessel reassert metadata', () => {

    expect(mapHookToState('sessionStart')).toEqual({

      state: 'idle',

      metadata: { reassert_vessel: true },

    });

  });



  it('maps extended Phase 1.3 hooks', () => {
    expect(mapHookToState('beforeReadFile', { path: 'src/map.ts' })).toEqual({
      state: 'searching',
    });

    expect(
      mapHookToState('beforeReadFile', {
        path: 'C:/Users/me/.cursor/skills/design-planner/SKILL.md',
      }),
    ).toEqual({
      state: 'searching',
      tool: 'Read',
    });

    expect(mapHookToState('afterFileEdit', { path: 'src/map.ts' })).toEqual({
      state: 'writing',
    });

    expect(mapHookToState('preCompact')).toEqual({ state: 'attention' });

    expect(
      mapHookToState('subagentStart', {
        subagent_type: 'explore',
        task: 'Find hook registration files',
      }),
    ).toEqual({
      state: 'working',
      tool: 'Task',
      metadata: {
        subagent_type: 'explore',
        task: 'Find hook registration files',
      },
    });

    expect(mapHookToState('subagentStop')).toEqual({ state: 'thinking' });
  });

  it('returns null for unregistered hooks', () => {
    expect(mapHookToState('workspaceOpen')).toBeNull();
  });

});



describe('extractToolName', () => {

  it('prefers tool_name over command', () => {

    expect(extractToolName({ tool_name: 'Read', command: 'ls' })).toBe('Read');

  });

});



describe('buildStatePayload', () => {

  it('writes protocol_version 1.0 and surface cursor', () => {

    const payload = buildStatePayload('thinking', { ts: 1_749_600_000_000 });



    expect(payload).toEqual({

      protocol_version: '1.0',

      ts: 1_749_600_000_000,

      surface: 'cursor',

      state: 'thinking',

    });

  });



  it('serializes newline-delimited JSON', () => {
    const line = serializeStatePayload(
      buildStatePayload('searching', { ts: 1_749_600_000_000, tool: 'Grep' }),
    );

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'cursor',
      state: 'searching',
      tool: 'Grep',
    });
  });

  it('includes subagent metadata in serialized payload', () => {
    const line = serializeStatePayload(
      buildStatePayload('working', {
        ts: 1_749_600_000_000,
        tool: 'Task',
        metadata: {
          subagent_type: 'shell',
          task: 'Run integration tests',
        },
      }),
    );

    expect(JSON.parse(line.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'cursor',
      state: 'working',
      tool: 'Task',
      metadata: {
        subagent_type: 'shell',
        task: 'Run integration tests',
      },
    });
  });

});



describe('sendStateToSocket', () => {

  it('writes one NDJSON line to a local listener', async () => {

    const received = await new Promise<string>((resolve, reject) => {

      const server: Server = createServer((socket) => {

        socket.once('data', (chunk) => {

          resolve(chunk.toString('utf8'));

          socket.end();

        });

      });



      server.once('error', reject);

      server.listen(0, '127.0.0.1', async () => {

        const address = server.address();

        if (!address || typeof address === 'string') {

          reject(new Error('Expected TCP port'));

          return;

        }



        await sendStateToSocket(

          { state: 'responding' },

          { host: '127.0.0.1', port: address.port, ts: 1_749_600_000_000 },

        );



        server.close();

      });

    });



    expect(JSON.parse(received.trim())).toEqual({

      protocol_version: '1.0',

      ts: 1_749_600_000_000,

      surface: 'cursor',

      state: 'responding',

    });

  });



  it('resolves silently when socket is unavailable', async () => {

    await expect(

      sendStateToSocket(

        { state: 'idle' },

        { host: '127.0.0.1', port: 1, ts: 1_749_600_000_000 },

      ),

    ).resolves.toBeUndefined();

  });

});



describe('runRelay', () => {

  it('relays mapped hook events to the socket', async () => {

    const received = await new Promise<string>((resolve, reject) => {

      const server: Server = createServer((socket) => {

        socket.once('data', (chunk) => {

          resolve(chunk.toString('utf8'));

          socket.end();

        });

      });



      server.once('error', reject);

      server.listen(0, '127.0.0.1', async () => {

        const address = server.address();

        if (!address || typeof address === 'string') {

          reject(new Error('Expected TCP port'));

          return;

        }



        process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);

        await runRelay('afterAgentResponse', '{}');

        delete process.env.EIDOLA_STATE_SOCKET_PORT;

        server.close();

      });

    });



    expect(JSON.parse(received.trim())).toMatchObject({

      protocol_version: '1.0',

      surface: 'cursor',

      state: 'success',

    });

  });



  it('relays tool-aware preToolUse states', async () => {

    const received = await new Promise<string>((resolve, reject) => {

      const server: Server = createServer((socket) => {

        socket.once('data', (chunk) => {

          resolve(chunk.toString('utf8'));

          socket.end();

        });

      });



      server.once('error', reject);

      server.listen(0, '127.0.0.1', async () => {

        const address = server.address();

        if (!address || typeof address === 'string') {

          reject(new Error('Expected TCP port'));

          return;

        }



        process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);

        await runRelay('preToolUse', JSON.stringify({ tool_name: 'Grep' }));

        delete process.env.EIDOLA_STATE_SOCKET_PORT;

        server.close();

      });

    });



    expect(JSON.parse(received.trim())).toMatchObject({

      protocol_version: '1.0',

      surface: 'cursor',

      state: 'searching',

      tool: 'Grep',

    });

  });

  it('relays subagentStart with metadata', async () => {
    const received = await new Promise<string>((resolve, reject) => {
      const server: Server = createServer((socket) => {
        socket.once('data', (chunk) => {
          resolve(chunk.toString('utf8'));
          socket.end();
        });
      });

      server.once('error', reject);

      server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Expected TCP port'));
          return;
        }

        process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);
        await runRelay(
          'subagentStart',
          JSON.stringify({
            subagent_type: 'explore',
            task: 'Map hook registration',
          }),
        );
        delete process.env.EIDOLA_STATE_SOCKET_PORT;
        server.close();
      });
    });

    expect(JSON.parse(received.trim())).toMatchObject({
      protocol_version: '1.0',
      surface: 'cursor',
      state: 'working',
      tool: 'Task',
      metadata: {
        subagent_type: 'explore',
        task: 'Map hook registration',
      },
    });
  });

  it('overlapping tool calls: A starts, B starts, A finishes -> tools_in_flight 1, B finishes -> tools_in_flight 0', async () => {
    const server: Server = createServer((socket) => {
      socket.on('data', (chunk) => {
        receivedLines.push(...chunk.toString('utf8').split('\n').filter(Boolean));
      });
    });

    const receivedLines: string[] = [];

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP port');
    }

    process.env.EIDOLA_STATE_SOCKET_PORT = String(address.port);

    await runRelay('preToolUse', JSON.stringify({ tool_name: 'Shell', command: 'sleep 5' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await runRelay('preToolUse', JSON.stringify({ tool_name: 'Grep' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await runRelay('postToolUse', JSON.stringify({ tool_name: 'Shell' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    await runRelay('postToolUse', JSON.stringify({ tool_name: 'Grep' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    delete process.env.EIDOLA_STATE_SOCKET_PORT;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(receivedLines.length).toBe(4);
    const aFinished = JSON.parse(receivedLines[2]);
    const bFinished = JSON.parse(receivedLines[3]);

    expect(aFinished.state).toBe('thinking');
    expect(aFinished.metadata?.tools_in_flight).toBe(1);

    expect(bFinished.state).toBe('thinking');
    expect(bFinished.metadata?.tools_in_flight).toBe(0);
  });

});

