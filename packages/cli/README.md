# @eidola/cli

The unified `eidola` CLI: MCP server, Shrine display, and reactive Vessel
control for [Eidola](https://eidola.app) — middleware that gives AI personas
a visible, reactive presence inside Cursor and Claude Code.

Local-first: runs over stdio (`eidola mcp`) or serves a browser Shrine
(`eidola launch shrine`). Binds locally; never proxies API keys. Single
install — there are no peer packages to install separately.

## Install

```bash
npm install -g "@eidola/cli"
```

Requires Node.js 20 or later.

## Setup

### 1. Create your Eidola folder

Create a folder called `Eidola` anywhere on your computer (e.g.
`~/Documents/Eidola/`) and unzip a downloaded Engram directly inside it.

### 2. Connect your AI editor

Run once, then fully quit and relaunch your editor:

```bash
eidola setup-claude   # Claude Code
eidola setup-cursor   # Cursor
```

`setup-claude` writes the MCP server entry and hook relay config into
`~/.claude/settings.json`. `setup-cursor` writes the MCP server entry to
`~/.cursor/mcp.json` plus the hook relay config — equivalent to:

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

Either command writes to your home directory by default; pass `--project`
to scope it to the current workspace instead.

### 3. Launch the Shrine

```bash
eidola launch shrine
```

Open the shrine in your browser at `http://127.0.0.1:9743/shrine/`. Or just
ask your editor's agent to "launch the shrine."

### 4. Awaken

In the Shrine UI: choose your Eidola folder → pick an Engram → click
**Awaken**. Optionally press F11 for fullscreen.

You can do the same thing from chat instead — ask your agent to "Awaken
`<engram-id>`" — it's equivalent to clicking Awaken in the UI.

## Commands

| Command | Description |
|---|---|
| `eidola mcp` | MCP server over stdio |
| `eidola launch shrine` | Start Shrine HTTP server at `http://127.0.0.1:9743/shrine` |
| `eidola kill shrine` | Stop a running Shrine HTTP server |
| `eidola setup-cursor [--project]` | Add Eidola MCP server to Cursor + install hooks for a reactive Vessel (global by default; `--project` for workspace-local) |
| `eidola setup-claude [--project]` | Add Eidola MCP server to Claude Code + install hooks for a reactive Vessel (global by default; `--project` for workspace-local) |

## MCP tools

A chat-based alternative to the Shrine UI, for calling from your editor's agent:

| Tool | Input | What it does |
|---|---|---|
| `awaken` | `engram_id` | Loads an Engram, binds its Vessel, wires up Soul delivery, and shows it on the Shrine display. |
| `sleep` | _(none)_ | Puts the active Engram to sleep and clears the Shrine display. |
| `launch_shrine` | `surface` (optional) | Starts the Shrine display if it isn't already running. |

## Environment

| Variable | Default | Description |
|---|---|---|
| `EIDOLA_ROOT` | cwd (published) or monorepo root (dev) | Your Eidola folder |
| `EIDOLA_ENGRAMS_DIR` | `$EIDOLA_ROOT` (published) or `$EIDOLA_ROOT/engrams` (monorepo dev) | Engram scan path |
| `EIDOLA_VESSELS_DIR` | `$EIDOLA_ROOT/vessels` | Vessel pack path |

## Learn more

Full source, the Engram spec, and other runtime packages (hook relays,
Shrine, Cursor extension) live in the
[eidola-runtime](https://github.com/AyeJK/eidola-runtime) repo.
