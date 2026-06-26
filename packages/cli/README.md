# @eidola/cli

Published npm package (`npm install -g @eidola/cli`) — unified `eidola` CLI for MCP server and Shrine HTTP display.

Runs over stdio (`eidola mcp`) or browser Shrine (`eidola launch shrine`). Binds locally; never proxies API keys.

**Packaging:** `@eidola/tool-state` is bundled into `dist/vendor/` (not published separately). Shrine server + Vite renderer ship in `dist/shrine/`; Three.js and Lottie are prebuilt into renderer assets — single `npm install -g @eidola/cli`, no peer packages.

## Install

```bash
npm install -g @eidola/cli
```

## Commands

| Command | Description |
|---|---|
| `eidola mcp` | MCP server over stdio |
| `eidola launch shrine` | Start Shrine HTTP server at `http://127.0.0.1:9743/shrine` |
| `eidola kill shrine` | Stop a running Shrine HTTP server |
| `eidola setup-claude-mcp` | Add Eidola MCP server to `~/.claude/settings.json` (global by default; `--project` for workspace-local) |
| `eidola setup-claude-hooks` | Install Claude Code hooks for reactive Vessel (global by default; `--project` for workspace-local) |
| `eidola setup-cursor-mcp` | Add Eidola MCP server to `~/.cursor/mcp.json` (global by default; `--project` for workspace-local) |
| `eidola setup-hooks` | Install Cursor hooks for reactive Vessel (global by default; `--project` for workspace-local) |
| `eidola link-engram <id>` | Link an Engram Soul to the current Cursor workspace |

## Claude Code setup

```bash
eidola setup-claude-mcp
eidola setup-claude-hooks
```

Then fully quit and relaunch Claude Code. This writes the MCP server entry and hook relay config into `~/.claude/settings.json` so tool activity drives your Vessel via Claude Code's native hook system.

## Cursor setup

```bash
eidola setup-cursor-mcp
eidola setup-hooks
```

Then fully quit and relaunch Cursor. This writes the MCP server entry to `~/.cursor/mcp.json` and the hook relay config so tool activity drives your Vessel — equivalent to:

```json
{
  "mcpServers": {
    "eidola": {
      "command": "eidola",
      "args": ["mcp"],
      "env": {
        "EIDOLA_ROOT": "/absolute/path/to/your/Eidola-folder"
      }
    }
  }
}
```

Unzip Engrams directly into your Eidola folder.

## Environment

| Variable | Default | Description |
|---|---|---|
| `EIDOLA_ROOT` | cwd (published) or monorepo root (dev) | Shaper folder or repo root |
| `EIDOLA_ENGRAMS_DIR` | `$EIDOLA_ROOT` (published) or `$EIDOLA_ROOT/engrams` (monorepo dev) | Engram scan path |
| `EIDOLA_VESSELS_DIR` | `$EIDOLA_ROOT/vessels` | Vessel pack path |
