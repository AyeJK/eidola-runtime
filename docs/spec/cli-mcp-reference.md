# CLI & MCP Tool Reference

`@eidola/cli` (bin: `eidola`) is both a command-line tool and, via `eidola mcp`, an MCP server. This page covers everything you can call: the CLI commands, the Shrine UI's Awaken flow, and the MCP tools your editor's agent uses.

---

## The Shrine UI

Once the runtime is installed and your editor is connected, the everyday way to load a persona is through the Shrine display itself, not chat:

1. Run `eidola launch shrine` (or ask your editor to "launch the shrine") — it opens in your browser.
2. In the Shrine UI, choose your Eidola folder, pick an Engram, and click **Awaken**.

That's it — the Shrine UI handles loading the Engram, binding its Vessel, and wiring up Soul delivery for your editor. The MCP tools below (`awaken`, `sleep`) exist so you can do the same thing from chat instead, when you'd rather not switch to the browser — they're equivalent, not a separate setup step.

---

## CLI commands

| Command | What it does |
|---|---|
| `eidola mcp` | Starts the MCP server over stdio. This is what your editor's MCP config invokes — you won't normally run this by hand. |
| `eidola launch shrine` | Starts the Shrine display (default `http://127.0.0.1:9743/shrine`) — this is where you pick a folder, pick an Engram, and click Awaken. |
| `eidola kill shrine` | Stops a running Shrine display. |
| `eidola setup-cursor [--global]` | Adds the Eidola MCP server to Cursor and installs the hooks that drive a reactive Vessel. Writes to `.cursor/` in the current workspace by default; pass `--global` to scope it to `~/.cursor/` instead. |
| `eidola setup-claude [--global]` | Adds the Eidola MCP server to Claude Code and installs the hooks that drive a reactive Vessel. Writes to `.claude/` in the current workspace by default; pass `--global` to scope it to `~/.claude/` instead. |
| `eidola uninstall [--global]` | Removes the Eidola MCP server entry and hooks from both Cursor and Claude Code configs at the given scope, and cleans up any `awaken`-written personality artifacts still active in the workspace (`.cursor/rules/{id}.mdc` + `.cursor/eidola.json`, and the CLAUDE.md marker block + `.claude/souls/{id}.md`). Reports which files were changed, or that nothing was found. |

Run `setup-cursor` and/or `setup-claude` once after installing, then restart your editor. Run `eidola uninstall` to remove Eidola's config from both editors again (matching `--global`/workspace-scoped as used at setup time) and clean up whichever Engram is currently awake in the workspace.

---

## MCP tools

A chat-based alternative to the Shrine UI's Awaken button — call these by asking your editor's agent (e.g. "Awaken `example-engram`" in chat), not typed at a terminal.

| Tool | Input | What it does |
|---|---|---|
| `awaken` | `engram_id` | Loads an Engram, binds its Vessel, wires up Soul delivery for your editor (a compiled Cursor rule and/or a Claude Code `CLAUDE.md` import), and shows it on the Shrine display. Same effect as clicking Awaken in the Shrine UI. |
| `sleep` | _(none)_ | Puts the active Engram to sleep — removes the Soul artifacts `awaken` wrote and clears the Shrine display. |
| `launch_shrine` | `surface` (optional) | Starts the Shrine display if it isn't already running. Pass `"kraken"` for the NZXT Kraken LCD preset — see [`nzxt-cam-web-integration.md`](./nzxt-cam-web-integration.md). |

`awaken` detects which editor it's running in and writes the right artifacts automatically — there's nothing else to configure.

See [`personality-injection.md`](./personality-injection.md) for more on how personality is bound to your editor.
