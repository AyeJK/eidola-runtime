#!/usr/bin/env node

const USAGE = `eidola — Eidola MCP server and Shrine display runtime

Usage:
  eidola mcp                  Start MCP server (stdio)
  eidola launch shrine        Start Shrine HTTP server
  eidola kill shrine          Stop a running Shrine HTTP server
  eidola setup-cursor         Add MCP server + install hooks for Cursor (recommended)
  eidola setup-claude         Add MCP server + install hooks for Claude Code (recommended)
  eidola setup-hooks          Install Cursor hooks only
  eidola setup-cursor-mcp     Add Eidola MCP server to ~/.cursor/mcp.json only
  eidola setup-claude-hooks   Install Claude Code hooks only
  eidola setup-claude-mcp     Add Eidola MCP server to ~/.claude/settings.json only
  eidola link-engram <id>     Link Engram Soul to current Cursor workspace
`;

async function main(): Promise<void> {
  const subcommand = process.argv[2];

  if (subcommand === 'mcp') {
    const { startEidolaMcpServer } = await import('./server.js');
    const { close } = await startEidolaMcpServer();

    const shutdown = async (signal: string) => {
      console.error('[eidola]', `${signal} received, shutting down...`);
      await close();
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    return;
  }

  if (subcommand === 'launch' && process.argv[3] === 'shrine') {
    const { resolveEidolaRuntimeConfig } = await import('./config.js');
    const { writeShrineLock } = await import('./cursor/shrine-lock.js');
    const config = resolveEidolaRuntimeConfig();

    const shrineUrl = new URL('./shrine/server/index.js', import.meta.url).href;
    const { startShrineHttpServer } = (await import(shrineUrl)) as {
      startShrineHttpServer: () => Promise<{ stop: () => void; url: string }>;
    };
    const server = await startShrineHttpServer();
    console.log(`Shrine running at ${server.url}`);

    await writeShrineLock(config.workspaceRoot, {
      pid: process.pid,
      surface: process.env.EIDOLA_SHRINE_DEV?.trim() ? 'dev' : 'cli',
      started_at: new Date().toISOString(),
    });

    const shutdown = async () => {
      server.stop();
      const { removeShrineLock } = await import('./cursor/shrine-lock.js');
      await removeShrineLock(config.workspaceRoot);
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
    return;
  }

  if (subcommand === 'kill' && process.argv[3] === 'shrine') {
    const { resolveEidolaRuntimeConfig } = await import('./config.js');
    const { stopShrine, killProcessesOnPort } = await import('./cursor/shrine-lock.js');
    const { shrineHttpPort } = await import('./cursor/shrine-surface.js');
    const config = resolveEidolaRuntimeConfig();

    const result = await stopShrine(config.workspaceRoot);
    const port = shrineHttpPort();
    const portPids = killProcessesOnPort(port).filter((pid) => pid !== result.pid);

    const messages: string[] = [];
    if (result.stopped) {
      const surfaceNote = result.surface === 'dev' ? ' (dev)' : '';
      messages.push(`Stopped Shrine (pid ${result.pid})${surfaceNote}.`);
    }
    if (portPids.length > 0) {
      messages.push(`Killed orphaned process${portPids.length > 1 ? 'es' : ''} on port ${port} (pid ${portPids.join(', ')}).`);
    }

    console.log(messages.length > 0 ? messages.join(' ') : 'No running Shrine found.');
    return;
  }

  if (subcommand === 'setup-cursor') {
    const { setupCursorMcp } = await import('./setup-cursor-mcp.js');
    const { setupCursorHooks } = await import('./setup-hooks.js');
    const projectMode = process.argv.includes('--project');
    const mcpResult = await setupCursorMcp({ global: !projectMode });
    const hooksResult = await setupCursorHooks({ global: !projectMode });
    console.log(`MCP   → ${mcpResult.mcpPath}`);
    console.log(`Hooks → ${hooksResult.hooksPath}`);
    console.log('Restart Cursor so the MCP server connects and hooks reload.');
    return;
  }

  if (subcommand === 'setup-claude') {
    const { setupClaudeMcp } = await import('./setup-claude-mcp.js');
    const { setupClaudeHooks } = await import('./setup-claude-hooks.js');
    const projectMode = process.argv.includes('--project');
    const mcpResult = await setupClaudeMcp({ global: !projectMode });
    const hooksResult = await setupClaudeHooks({ global: !projectMode });
    console.log(`MCP   → ${mcpResult.settingsPath}`);
    console.log(`Hooks → ${hooksResult.settingsPath}`);
    console.log('Restart Claude Code so the MCP server connects and hooks reload.');
    return;
  }

  if (subcommand === 'setup-hooks') {
    const { setupCursorHooks } = await import('./setup-hooks.js');
    const projectMode = process.argv.includes('--project');
    const result = await setupCursorHooks({ global: !projectMode });
    console.log(`Wrote ${result.hooksPath}`);
    console.log(`Relay → ${result.relayPath}`);
    console.log('Restart Cursor so hooks reload.');
    return;
  }

  if (subcommand === 'setup-cursor-mcp') {
    const { setupCursorMcp } = await import('./setup-cursor-mcp.js');
    const projectMode = process.argv.includes('--project');
    const result = await setupCursorMcp({ global: !projectMode });
    console.log(`Wrote ${result.mcpPath}`);
    console.log('Restart Cursor so the MCP server connects.');
    return;
  }

  if (subcommand === 'setup-claude-hooks') {
    const { setupClaudeHooks } = await import('./setup-claude-hooks.js');
    const projectMode = process.argv.includes('--project');
    const result = await setupClaudeHooks({ global: !projectMode });
    console.log(`Wrote ${result.settingsPath}`);
    console.log(`Relay → ${result.relayPath}`);
    console.log('Restart Claude Code so hooks reload.');
    return;
  }

  if (subcommand === 'setup-claude-mcp') {
    const { setupClaudeMcp } = await import('./setup-claude-mcp.js');
    const projectMode = process.argv.includes('--project');
    const result = await setupClaudeMcp({ global: !projectMode });
    console.log(`Wrote ${result.settingsPath}`);
    console.log('Restart Claude Code so the MCP server connects.');
    return;
  }

  if (subcommand === 'link-engram') {
    const engramId = process.argv[3]?.trim();
    if (!engramId) {
      console.error('Usage: eidola link-engram <engram-id>');
      process.exit(1);
    }

    const { resolveEidolaRuntimeConfig } = await import('./config.js');
    const { linkEngramToWorkspace } = await import('./cursor/link-engram.js');
    const { readWorkspaceConfig } = await import('./cursor/workspace-config.js');
    const { resolveEngramLocation } = await import('./engram/registry.js');

    const config = resolveEidolaRuntimeConfig();
    if (!config.workspaceRoot) {
      console.error('No Cursor workspace root. Set EIDOLA_WORKSPACE or run from your project.');
      process.exit(1);
    }

    let engramDirectory: string | undefined;
    let vesselsDir: string | undefined;
    try {
      const located = await resolveEngramLocation(config.engramsDir, engramId);
      engramDirectory = located.directory;
      vesselsDir = located.vesselsDir;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }

    const priorConfig = await readWorkspaceConfig(config.workspaceRoot);
    const result = await linkEngramToWorkspace({
      workspaceRoot: config.workspaceRoot,
      engramId,
      engramsDir: config.engramsDir,
      engramDirectory,
      vesselsDir,
      previousEngramId: priorConfig?.active_engram_id,
    });

    console.log(`Linked Engram "${result.engramId}" to workspace.`);
    console.log(`  Rule: ${result.mdcPath}`);
    console.log(`  Config: ${result.workspaceConfigPath}`);
    return;
  }

  if (!subcommand) {
    console.error(USAGE);
    process.exit(1);
  }

  console.error(`Unknown subcommand: ${subcommand}\n${USAGE}`);
  process.exit(1);
}

main().catch((error) => {
  console.error('[eidola] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
