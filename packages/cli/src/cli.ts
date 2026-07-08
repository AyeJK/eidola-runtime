#!/usr/bin/env node

const USAGE = `eidola — Eidola MCP server and Shrine display runtime

Usage:
  eidola mcp                  Start MCP server (stdio)
  eidola launch shrine        Start Shrine HTTP server
  eidola kill shrine          Stop a running Shrine HTTP server
  eidola setup-cursor         Add MCP server + install hooks for Cursor (workspace-scoped; --global for ~/.cursor)
  eidola setup-claude         Add MCP server + install hooks for Claude Code (workspace-scoped; --global for ~/.claude)
  eidola uninstall            Remove MCP server + hooks + active Engram artifacts, then uninstall the npm package itself
                               (config is workspace-scoped; --global for home dir; --keep-package skips the npm removal)
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
    const globalMode = process.argv.includes('--global');
    const mcpResult = await setupCursorMcp({ global: globalMode });
    const hooksResult = await setupCursorHooks({ global: globalMode });
    console.log(`MCP   → ${mcpResult.mcpPath}`);
    console.log(`Hooks → ${hooksResult.hooksPath}`);
    console.log('Restart Cursor so the MCP server connects and hooks reload.');
    return;
  }

  if (subcommand === 'setup-claude') {
    const { setupClaudeMcp } = await import('./setup-claude-mcp.js');
    const { setupClaudeHooks } = await import('./setup-claude-hooks.js');
    const globalMode = process.argv.includes('--global');
    const mcpResult = await setupClaudeMcp({ global: globalMode });
    const hooksResult = await setupClaudeHooks({ global: globalMode });
    console.log(`MCP   → ${mcpResult.settingsPath}`);
    console.log(`Hooks → ${hooksResult.settingsPath}`);
    console.log('Restart Claude Code so the MCP server connects and hooks reload.');
    return;
  }

  if (subcommand === 'uninstall') {
    const { uninstallCursorMcp, uninstallCursorHooks } = await import('./uninstall-cursor.js');
    const { uninstallClaudeMcp, uninstallClaudeHooks } = await import('./uninstall-claude.js');
    const { uninstallCursorEngramArtifacts, uninstallClaudeEngramArtifacts } = await import(
      './uninstall-workspace.js'
    );
    const globalMode = process.argv.includes('--global');

    const cursorMcp = await uninstallCursorMcp({ global: globalMode });
    const cursorHooks = await uninstallCursorHooks({ global: globalMode });
    const claudeMcp = await uninstallClaudeMcp({ global: globalMode });
    const claudeHooks = await uninstallClaudeHooks({ global: globalMode });
    const cursorEngram = await uninstallCursorEngramArtifacts();
    const claudeEngram = await uninstallClaudeEngramArtifacts();

    const removed: string[] = [];
    if (cursorMcp.removed) removed.push(`MCP   → ${cursorMcp.mcpPath}`);
    if (cursorHooks.removed) removed.push(`Hooks → ${cursorHooks.hooksPath}`);
    if (claudeMcp.removed) removed.push(`MCP   → ${claudeMcp.settingsPath}`);
    if (claudeHooks.removed) removed.push(`Hooks → ${claudeHooks.settingsPath}`);
    if (cursorEngram.removed) removed.push(`Engram → ${cursorEngram.mdcPath ?? cursorEngram.configPath}`);
    if (claudeEngram.removed) removed.push(`Engram → ${claudeEngram.soulPath ?? claudeEngram.claudeMdPath}`);

    if (removed.length === 0) {
      console.log('Nothing to uninstall — no Eidola entries found.');
    } else {
      console.log('Removed:');
      for (const line of removed) {
        console.log(`  ${line}`);
      }
    }

    if (process.argv.includes('--keep-package')) {
      console.log('Restart your editor(s) so the change takes effect.');
      return;
    }

    const { uninstallNpmPackage } = await import('./uninstall-npm-package.js');
    console.log('Removing the @eidola/cli npm package...');
    const npmResult = await uninstallNpmPackage();
    if (npmResult.ok) {
      console.log('npm package removed (or was already absent).');
    } else {
      console.error(`Failed to remove the npm package automatically: ${npmResult.output}`);
      console.error('Remove it yourself with: npm uninstall -g @eidola/cli');
    }

    console.log('Restart your editor(s) so the change takes effect.');
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
