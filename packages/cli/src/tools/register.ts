import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { EidolaToolHandlers } from './handlers.js';

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function registerEidolaTools(server: McpServer, handlers: EidolaToolHandlers): void {
  server.registerTool(
    'launch_shrine',
    {
      title: 'Launch Shrine',
      description:
        'Start the Eidola Shrine HTTP server for browser-based display surfaces. Idempotent when the same surface is already running.',
      inputSchema: {
        surface: z
          .string()
          .optional()
          .describe('Shrine surface preset or alias — use "kraken" for NZXT Kraken LCD'),
      },
    },
    async ({ surface }) =>
      jsonResult(await handlers.launchShrine(surface ? { surface } : undefined)),
  );

  server.registerTool(
    'awaken',
    {
      title: 'Awaken Engram',
      description:
        'Awaken an Engram by id — binds the Vessel, shows it on the Shrine display, and wires hook-driven expression updates. Alternative to clicking Awaken in the Shrine UI.',
      inputSchema: {
        engram_id: z.string().describe('Engram directory id from engram.yaml'),
      },
    },
    async ({ engram_id }) =>
      jsonResult(await handlers.awaken(engram_id, server.server.getClientVersion())),
  );

  server.registerTool(
    'sleep',
    {
      title: 'Sleep Engram',
      description:
        'Put the active Engram\'s injected Soul to sleep — removes the platform-specific artifacts awaken wrote (Cursor .mdc deactivation, Claude Code CLAUDE.md import + soul file) and clears the Shrine display. Errors if nothing is active.',
      inputSchema: {},
    },
    async () => jsonResult(await handlers.sleep(server.server.getClientVersion())),
  );

}
