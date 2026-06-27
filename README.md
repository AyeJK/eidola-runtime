# Eidola Runtime

AI Personality Runtime — portable persona system with reactive avatars.

Eidola gives AI personas a visible, reactive presence, inside the editors you
already use. Install one CLI, awaken a persona ("**Engram**"), and a local 
display (**Shrine**) shows an animated avatar (**Vessel**) that reacts to 
what your agent is doing.

This repo is the open, MIT-licensed runtime — the local-first middleware you
install and run yourself. It's not a chat app; it sits on top of your editor
via MCP and hooks. No lock-in, fully auditable.

Browse, create, and publish Engrams at [Eidola.app](https://eidola.app).

## Install

### 1. Install the runtime

```bash
npm install -g "@eidola/cli"
```

Requires Node.js 20 or later.

### 2. Create your Eidola folder

Create a folder called `Eidola` anywhere on your computer (e.g.
`~/Documents/Eidola/`) and download an Engram into it — unzip it directly
inside.

### 3. Connect your AI editor

Run one of these once, then fully quit and relaunch your editor:

```bash
eidola setup-claude   # Claude Code
eidola setup-cursor   # Cursor
```

Each writes the Eidola MCP server entry plus the hook relay config that
drives a reactive Vessel from tool activity (global by default; pass
`--project` to scope either command to the current workspace instead).

### 4. Launch the Shrine

```bash
eidola launch shrine
```

Open the shrine in your browser at `http://127.0.0.1:9743/shrine/`. Or just ask your
editor's agent to "launch the shrine."

### 5. Awaken

In the Shrine UI: choose your Eidola folder → pick an Engram → click
**Awaken**. Optionally press F11 for fullscreen.

You can do the same thing from chat instead — ask your agent to "Awaken
`<engram-id>`" — it's equivalent to clicking Awaken in the UI.

## CLI commands

| Command | What it does |
|---|---|
| `eidola mcp` | Starts the MCP server over stdio. Your editor's MCP config invokes this — you won't normally run it by hand. |
| `eidola launch shrine` | Starts the Shrine display (`http://127.0.0.1:9743/shrine`). |
| `eidola kill shrine` | Stops a running Shrine display. |
| `eidola setup-cursor [--project]` | Adds the Eidola MCP server to Cursor and installs the reactive-Vessel hooks. |
| `eidola setup-claude [--project]` | Adds the Eidola MCP server to Claude Code and installs the reactive-Vessel hooks. |

## MCP tools

For driving Eidola from chat instead of the Shrine UI:

| Tool | Input | What it does |
|---|---|---|
| `awaken` | `engram_id` | Loads an Engram, binds its Vessel, wires up Soul delivery for your editor, and shows it on the Shrine display. |
| `sleep` | _(none)_ | Puts the active Engram to sleep — removes the Soul artifacts `awaken` wrote and clears the Shrine display. |
| `launch_shrine` | `surface` (optional) | Starts the Shrine display if it isn't already running. |

See [`docs/spec/cli-mcp-reference.md`](./docs/spec/cli-mcp-reference.md) for full details.

## What's an Engram

An Engram is a portable persona package:

```
{id}/
  SOUL.md        # personality, written in prose
  vessel.yaml    # expression map (state → clip)
  engram.yaml    # metadata/version
vessels/{pack}/
  idle.mp4      # or .gif / .json / .webm
  thinking.mp4
  ...
```

The full spec lives in [`docs/spec/engram-format.md`](./docs/spec/engram-format.md).

## What's in this repo

| Package | Published as | What it does |
|---|---|---|
| `packages/cli` | [`@eidola/cli`](https://www.npmjs.com/package/@eidola/cli) | MCP server + CLI. Runs over stdio (`eidola mcp`) for editor integration, or serves the Shrine HTTP display (`eidola launch shrine`). Also installs hook relays and MCP config for Cursor/Claude Code. |
| `packages/tool-state` | `@eidola/tool-state` | Shared tool-name → Vessel visual-state mapping, used by both hook relay packages and the Cursor extension. |
| `packages/cursor-hooks` | `@eidola/cursor-hooks` | Reads Cursor agent hook events and relays them to the local state socket. |
| `packages/claude-hooks` | `@eidola/claude-hooks` | Reads Claude Code hook events and relays them to the local state socket. |
| `packages/shrine` | `@eidola/shrine` | The Shrine — a local HTTP server that renders the active Vessel (Lottie/WebM/Three.js) and reacts to live state over SSE. |
| `packages/cursor-ext` | `eidola-state-bridge` (VS Code Marketplace) | Optional VS Code extension for coarser LM-state signals inside Cursor. Not published under the `@eidola/*` npm scope — it's a Marketplace listing, not an npm package. |

## Building from source

```bash
pnpm install
pnpm build
pnpm test
```

Each package can also be built/tested individually with `pnpm --filter <package> run build`.

## Contributing

This repo is young and still stabilizing its public release shape. Issues
and PRs are welcome — please open an issue to discuss substantial changes
before sending a PR, since the Engram spec format and the hook
relay/state-socket protocol are both meant to stay stable across installs.
Run `pnpm build && pnpm test` before submitting.

## License

MIT — see [LICENSE](./LICENSE). The Engram spec format is, and will remain,
open regardless of what gets built or monetized on top of it.
